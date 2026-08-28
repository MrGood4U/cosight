//go:build windows && amd64

package main

import (
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"sync/atomic"
	"syscall"
	"unsafe"
)

const (
	hresultOK          int32 = 0
	hresultUnexpected  int32 = -2147418113 // 0x8000FFFF
	hresultInvalidArg  int32 = -2147024809 // 0x80070057
	hresultNoInterface int32 = -2147467262 // 0x80004002
	hresultPointer     int32 = -2147467261 // 0x80004003

	waitObject0 uint32 = 0
	waitTimeout uint32 = 258

	coinitMultithreaded uint32 = 0x0
	vtBlob              uint16 = 65

	audioClientActivationTypeProcessLoopback uint32 = 1
	processLoopbackModeExcludeTree           uint32 = 1

	audclntSharemodeShared              uint32 = 0
	audclntStreamflagsLoopback          uint32 = 0x00020000
	audclntStreamflagsEventcallback     uint32 = 0x00040000
	audclntStreamflagsAutoconvertPCM    uint32 = 0x80000000
	audclntStreamflagsSrcDefaultQuality uint32 = 0x08000000

	audclntBufferDuration int64 = 1_000_000 // 100 ms, in 100 ns units.

	// VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK is a Windows SDK macro whose
	// value is VAD\\Process_Loopback. Pass the value, not the macro name, to
	// ActivateAudioInterfaceAsync.
	processLoopbackDevicePath = "VAD\\Process_Loopback"

	// The process-loopback virtual device has no physical mix format. Use the
	// format recommended by the Windows sample and resample it to 16 kHz
	// before writing PCM to stdout.
	processLoopbackSampleRate uint32 = 44100
	processLoopbackChannels   uint16 = 2
	processLoopbackBits       uint16 = 32

	waveFormatIEEEFloat      uint16 = 3
	waveFormatExtensible     uint16 = 0xfffe
	audclntBufferflagsSilent uint32 = 0x00000002
)

var (
	ole32              = syscall.NewLazyDLL("ole32.dll")
	mmdevapi           = syscall.NewLazyDLL("mmdevapi.dll")
	kernel32           = syscall.NewLazyDLL("kernel32.dll")
	procCoInitializeEx = ole32.NewProc("CoInitializeEx")
	procCoUninitialize = ole32.NewProc("CoUninitialize")
	procCoTaskMemAlloc = ole32.NewProc("CoTaskMemAlloc")
	procCoTaskMemFree  = ole32.NewProc("CoTaskMemFree")
	procActivateAudio  = mmdevapi.NewProc("ActivateAudioInterfaceAsync")
	procCreateEvent    = kernel32.NewProc("CreateEventW")
	procWaitForSingle  = kernel32.NewProc("WaitForSingleObject")
	procSetEvent       = kernel32.NewProc("SetEvent")
	procCloseHandle    = kernel32.NewProc("CloseHandle")
)

type guid struct {
	data1 uint32
	data2 uint16
	data3 uint16
	data4 [8]byte
}

var (
	iidIUnknown    = guid{}
	iidAgileObject = guid{
		data1: 0x94ea2b94,
		data2: 0xe9cc,
		data3: 0x49e0,
		data4: [8]byte{0xc0, 0xff, 0xee, 0x64, 0xca, 0x8f, 0x5b, 0x90},
	}
	iidAudioClient = guid{
		data1: 0x1cb9ad4c,
		data2: 0xdbfa,
		data3: 0x4c32,
		data4: [8]byte{0xb1, 0x78, 0xc2, 0xf5, 0x68, 0xa7, 0x03, 0xb2},
	}
	iidAudioCaptureClient = guid{
		data1: 0xc8adbd64,
		data2: 0xe71e,
		data3: 0x48a0,
		data4: [8]byte{0xa4, 0xde, 0x18, 0x5c, 0x39, 0x5c, 0xd3, 0x17},
	}
	iidActivationCompletionHandler = guid{
		data1: 0x41d949ab,
		data2: 0x9862,
		data3: 0x444a,
		data4: [8]byte{0x80, 0xf6, 0xc2, 0x61, 0x33, 0x4d, 0xa5, 0xeb},
	}
	iidIEEEFloat = guid{
		data1: 0x00000003,
		data2: 0x0000,
		data3: 0x0010,
		data4: [8]byte{0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71},
	}
)

type propVariantBlob struct {
	vt        uint16
	reserved1 uint16
	reserved2 uint16
	reserved3 uint16
	blobSize  uint32
	blobData  uintptr
}

type audioClientActivationParams struct {
	activationType      uint32
	targetProcessID     uint32
	processLoopbackMode uint32
}

type waveFormatEx struct {
	formatTag      uint16
	channels       uint16
	samplesPerSec  uint32
	avgBytesPerSec uint32
	blockAlign     uint16
	bitsPerSample  uint16
	cbSize         uint16
}

type activationHandler struct {
	vtable            uintptr
	refs              uint32
	_                 uint32
	completedEvent    syscall.Handle
	callbackDoneEvent syscall.Handle
	result            int32
	_                 uint32
	audioClient       uintptr
}

func succeeded(hr int32) bool {
	return hr >= 0
}

func asHRESULT(hr int32) uintptr {
	return uintptr(uint32(hr))
}

func comMethod(object uintptr, index uintptr) uintptr {
	vtable := *(*uintptr)(unsafe.Pointer(object))
	return *(*uintptr)(unsafe.Pointer(vtable + index*unsafe.Sizeof(uintptr(0))))
}

func callCOM(method uintptr, args ...uintptr) uintptr {
	result, _, _ := syscall.SyscallN(method, args...)
	return result
}

func comRelease(object uintptr) {
	if object != 0 {
		callCOM(comMethod(object, 2), object)
	}
}

func equalGUID(left uintptr, right *guid) bool {
	if left == 0 {
		return false
	}
	return *(*guid)(unsafe.Pointer(left)) == *right
}

func coTaskAlloc(size uintptr) unsafe.Pointer {
	result, _, _ := procCoTaskMemAlloc.Call(size)
	return unsafe.Pointer(result)
}

func coTaskFree(pointer unsafe.Pointer) {
	if pointer != nil {
		procCoTaskMemFree.Call(uintptr(pointer))
	}
}

func createEvent(manualReset bool) (syscall.Handle, error) {
	manual := uintptr(0)
	if manualReset {
		manual = 1
	}
	result, _, err := procCreateEvent.Call(0, manual, 0, 0)
	if result == 0 {
		return 0, err
	}
	return syscall.Handle(result), nil
}

func waitForEvent(event syscall.Handle, timeout uint32) uint32 {
	result, _, _ := procWaitForSingle.Call(uintptr(event), uintptr(timeout))
	return uint32(result)
}

func setEvent(event syscall.Handle) {
	if event != 0 {
		procSetEvent.Call(uintptr(event))
	}
}

func closeHandle(event syscall.Handle) {
	if event != 0 {
		procCloseHandle.Call(uintptr(event))
	}
}

func handlerQueryInterface(this, riid, output uintptr) uintptr {
	if output == 0 {
		return asHRESULT(hresultPointer)
	}
	*(*uintptr)(unsafe.Pointer(output)) = 0

	handler := (*activationHandler)(unsafe.Pointer(this))
	if equalGUID(riid, &iidIUnknown) ||
		equalGUID(riid, &iidActivationCompletionHandler) ||
		equalGUID(riid, &iidAgileObject) {
		*(*uintptr)(unsafe.Pointer(output)) = this
		atomic.AddUint32(&handler.refs, 1)
		return asHRESULT(hresultOK)
	}
	return asHRESULT(hresultNoInterface)
}

func handlerAddRef(this uintptr) uintptr {
	handler := (*activationHandler)(unsafe.Pointer(this))
	return uintptr(atomic.AddUint32(&handler.refs, 1))
}

func handlerRelease(this uintptr) uintptr {
	handler := (*activationHandler)(unsafe.Pointer(this))
	refs := atomic.AddUint32(&handler.refs, ^uint32(0))
	if refs == 0 {
		vtable := handler.vtable
		coTaskFree(unsafe.Pointer(vtable))
		coTaskFree(unsafe.Pointer(this))
	}
	return uintptr(refs)
}

func handlerActivateCompleted(this, operation uintptr) (result uintptr) {
	handler := (*activationHandler)(unsafe.Pointer(this))
	defer func() {
		// The caller waits for this event before releasing its reference.
		setEvent(handler.callbackDoneEvent)
	}()

	activationResult := hresultUnexpected
	var activatedInterface uintptr
	hr := hresultUnexpected
	if operation != 0 {
		hr = int32(callCOM(
			comMethod(operation, 3),
			operation,
			uintptr(unsafe.Pointer(&activationResult)),
			uintptr(unsafe.Pointer(&activatedInterface)),
		))
		if succeeded(hr) {
			hr = activationResult
		}
	}

	if succeeded(hr) && activatedInterface != 0 {
		handler.audioClient = activatedInterface
	} else if activatedInterface != 0 {
		comRelease(activatedInterface)
	}
	atomic.StoreInt32(&handler.result, hr)
	setEvent(handler.completedEvent)
	return asHRESULT(hresultOK)
}

func newActivationHandler(completedEvent, callbackDoneEvent syscall.Handle) (*activationHandler, error) {
	vtableMemory := coTaskAlloc(4 * unsafe.Sizeof(uintptr(0)))
	if vtableMemory == nil {
		return nil, fmt.Errorf("CoTaskMemAlloc failed for callback vtable")
	}
	vtable := unsafe.Slice((*uintptr)(vtableMemory), 4)
	vtable[0] = syscall.NewCallback(handlerQueryInterface)
	vtable[1] = syscall.NewCallback(handlerAddRef)
	vtable[2] = syscall.NewCallback(handlerRelease)
	vtable[3] = syscall.NewCallback(handlerActivateCompleted)

	objectMemory := coTaskAlloc(unsafe.Sizeof(activationHandler{}))
	if objectMemory == nil {
		coTaskFree(vtableMemory)
		return nil, fmt.Errorf("CoTaskMemAlloc failed for callback object")
	}
	handler := (*activationHandler)(objectMemory)
	*handler = activationHandler{
		vtable:            uintptr(vtableMemory),
		refs:              1,
		completedEvent:    completedEvent,
		callbackDoneEvent: callbackDoneEvent,
		result:            hresultUnexpected,
	}
	return handler, nil
}

func activateProcessLoopback(excludedProcessID uint32) (uintptr, error) {
	completedEvent, err := createEvent(true)
	if err != nil {
		return 0, fmt.Errorf("CreateEvent(completed): %w", err)
	}
	callbackDoneEvent, err := createEvent(true)
	if err != nil {
		closeHandle(completedEvent)
		return 0, fmt.Errorf("CreateEvent(callback): %w", err)
	}

	handler, err := newActivationHandler(completedEvent, callbackDoneEvent)
	if err != nil {
		closeHandle(callbackDoneEvent)
		closeHandle(completedEvent)
		return 0, err
	}

	devicePath, err := syscall.UTF16PtrFromString(processLoopbackDevicePath)
	if err != nil {
		handlerRelease(uintptr(unsafe.Pointer(handler)))
		closeHandle(callbackDoneEvent)
		closeHandle(completedEvent)
		return 0, err
	}
	params := audioClientActivationParams{
		activationType:      audioClientActivationTypeProcessLoopback,
		targetProcessID:     excludedProcessID,
		processLoopbackMode: processLoopbackModeExcludeTree,
	}
	activateParams := propVariantBlob{
		vt:       vtBlob,
		blobSize: uint32(unsafe.Sizeof(params)),
		blobData: uintptr(unsafe.Pointer(&params)),
	}

	var operation uintptr
	activationResult, _, callErr := procActivateAudio.Call(
		uintptr(unsafe.Pointer(devicePath)),
		uintptr(unsafe.Pointer(&iidAudioClient)),
		uintptr(unsafe.Pointer(&activateParams)),
		uintptr(unsafe.Pointer(handler)),
		uintptr(unsafe.Pointer(&operation)),
	)
	runtime.KeepAlive(params)
	runtime.KeepAlive(activateParams)
	if int32(activationResult) < 0 {
		if operation != 0 {
			comRelease(operation)
		}
		handlerRelease(uintptr(unsafe.Pointer(handler)))
		closeHandle(callbackDoneEvent)
		closeHandle(completedEvent)
		return 0, fmt.Errorf("ActivateAudioInterfaceAsync failed: HRESULT 0x%08X (%v)", uint32(activationResult), callErr)
	}

	if waitForEvent(completedEvent, 10_000) != waitObject0 {
		if operation != 0 {
			comRelease(operation)
		}
		handlerRelease(uintptr(unsafe.Pointer(handler)))
		closeHandle(callbackDoneEvent)
		closeHandle(completedEvent)
		return 0, fmt.Errorf("ActivateAudioInterfaceAsync timed out")
	}
	if waitForEvent(callbackDoneEvent, 10_000) != waitObject0 {
		if operation != 0 {
			comRelease(operation)
		}
		handlerRelease(uintptr(unsafe.Pointer(handler)))
		closeHandle(callbackDoneEvent)
		closeHandle(completedEvent)
		return 0, fmt.Errorf("ActivateAudioInterfaceAsync callback did not return")
	}

	hr := atomic.LoadInt32(&handler.result)
	audioClient := handler.audioClient
	handler.audioClient = 0
	if operation != 0 {
		comRelease(operation)
	}
	handlerRelease(uintptr(unsafe.Pointer(handler)))
	closeHandle(callbackDoneEvent)
	closeHandle(completedEvent)
	if !succeeded(hr) {
		if audioClient != 0 {
			comRelease(audioClient)
		}
		return 0, fmt.Errorf("audio activation failed: HRESULT 0x%08X", uint32(hr))
	}
	if audioClient == 0 {
		return 0, fmt.Errorf("audio activation returned a nil IAudioClient")
	}
	return audioClient, nil
}

func isFloatFormat(formatPointer uintptr, format *waveFormatEx) bool {
	if format.formatTag == waveFormatIEEEFloat {
		return true
	}
	if format.formatTag != waveFormatExtensible || format.cbSize < 22 {
		return false
	}
	// WAVEFORMATEXTENSIBLE.SubFormat starts at offset 24 from WAVEFORMATEX.
	return *(*guid)(unsafe.Pointer(formatPointer + 24)) == iidIEEEFloat
}

func readSample(data []byte, frame, channel int, format *waveFormatEx, floatFormat bool) float32 {
	bytesPerSample := int(format.bitsPerSample / 8)
	offset := frame*int(format.blockAlign) + channel*bytesPerSample
	if bytesPerSample <= 0 || offset < 0 || offset+bytesPerSample > len(data) {
		return 0
	}
	sample := data[offset:]
	switch {
	case floatFormat && format.bitsPerSample == 32:
		return math.Float32frombits(binary.LittleEndian.Uint32(sample))
	case format.bitsPerSample == 16:
		return float32(int16(binary.LittleEndian.Uint16(sample))) / 32768.0
	case format.bitsPerSample == 24:
		value := int32(sample[0]) | int32(sample[1])<<8 | int32(sample[2])<<16
		if value&0x00800000 != 0 {
			value |= ^0x00ffffff
		}
		return float32(value) / 8388608.0
	case format.bitsPerSample == 32:
		return float32(int32(binary.LittleEndian.Uint32(sample))) / 2147483648.0
	default:
		return 0
	}
}

type resampler struct {
	step     float64
	position float64
	samples  []float32
}

func newResampler(inputRate uint32) *resampler {
	return &resampler{step: float64(inputRate) / 16000.0}
}

func (r *resampler) append(input []float32) []int16 {
	r.samples = append(r.samples, input...)
	output := make([]int16, 0, len(input))
	for r.position+1.0 < float64(len(r.samples)) {
		index := int(r.position)
		fraction := r.position - float64(index)
		sample := r.samples[index]*(1.0-float32(fraction)) + r.samples[index+1]*float32(fraction)
		if sample > 1 {
			sample = 1
		} else if sample < -1 {
			sample = -1
		}
		output = append(output, int16(math.Round(float64(sample*32767.0))))
		r.position += r.step
	}
	consumed := int(r.position)
	if consumed > 0 {
		copy(r.samples, r.samples[consumed:])
		r.samples = r.samples[:len(r.samples)-consumed]
		r.position -= float64(consumed)
	}
	return output
}

func writePCM(samples []int16) error {
	if len(samples) == 0 {
		return nil
	}
	bytes := make([]byte, len(samples)*2)
	for index, sample := range samples {
		binary.LittleEndian.PutUint16(bytes[index*2:], uint16(sample))
	}
	_, err := os.Stdout.Write(bytes)
	return err
}

func captureAudio(excludedProcessID uint32, stop *atomic.Bool) error {
	audioClient, err := activateProcessLoopback(excludedProcessID)
	if err != nil {
		return err
	}
	defer comRelease(audioClient)

	// The process-loopback virtual device does not expose a physical mix
	// format, so GetMixFormat is not supported here. Supply a standard format
	// explicitly, matching the Windows Application Loopback sample.
	format := waveFormatEx{
		formatTag:      waveFormatIEEEFloat,
		channels:       processLoopbackChannels,
		samplesPerSec:  processLoopbackSampleRate,
		avgBytesPerSec: processLoopbackSampleRate * uint32(processLoopbackChannels) * uint32(processLoopbackBits/8),
		blockAlign:     processLoopbackChannels * (processLoopbackBits / 8),
		bitsPerSample:  processLoopbackBits,
	}
	floatFormat := true

	flags := audclntStreamflagsLoopback | audclntStreamflagsEventcallback | audclntStreamflagsAutoconvertPCM | audclntStreamflagsSrcDefaultQuality
	hr := int32(callCOM(
		comMethod(audioClient, 3),
		audioClient,
		uintptr(audclntSharemodeShared),
		uintptr(flags),
		uintptr(audclntBufferDuration),
		0,
		uintptr(unsafe.Pointer(&format)),
		0,
	))
	if !succeeded(hr) {
		return fmt.Errorf("IAudioClient::Initialize failed: HRESULT 0x%08X", uint32(hr))
	}

	sampleReadyEvent, err := createEvent(false)
	if err != nil {
		return fmt.Errorf("CreateEvent(sample-ready): %w", err)
	}
	defer closeHandle(sampleReadyEvent)
	hr = int32(callCOM(comMethod(audioClient, 13), audioClient, uintptr(sampleReadyEvent)))
	if !succeeded(hr) {
		return fmt.Errorf("IAudioClient::SetEventHandle failed: HRESULT 0x%08X", uint32(hr))
	}

	var captureClient uintptr
	hr = int32(callCOM(
		comMethod(audioClient, 14),
		audioClient,
		uintptr(unsafe.Pointer(&iidAudioCaptureClient)),
		uintptr(unsafe.Pointer(&captureClient)),
	))
	if !succeeded(hr) || captureClient == 0 {
		return fmt.Errorf("IAudioClient::GetService(IAudioCaptureClient) failed: HRESULT 0x%08X", uint32(hr))
	}
	defer comRelease(captureClient)

	hr = int32(callCOM(comMethod(audioClient, 10), audioClient))
	if !succeeded(hr) {
		return fmt.Errorf("IAudioClient::Start failed: HRESULT 0x%08X", uint32(hr))
	}
	defer callCOM(comMethod(audioClient, 11), audioClient)

	resampler := newResampler(format.samplesPerSec)
	for !stop.Load() {
		waitResult := waitForEvent(sampleReadyEvent, 1_000)
		if waitResult == waitTimeout {
			continue
		}
		if waitResult != waitObject0 {
			return fmt.Errorf("WaitForSingleObject(sample-ready) failed: %d", waitResult)
		}

		var framesAvailable uint32
		hr = int32(callCOM(
			comMethod(captureClient, 5),
			captureClient,
			uintptr(unsafe.Pointer(&framesAvailable)),
		))
		if !succeeded(hr) {
			return fmt.Errorf("IAudioCaptureClient::GetNextPacketSize failed: HRESULT 0x%08X", uint32(hr))
		}
		for framesAvailable > 0 && !stop.Load() {
			var dataPointer uintptr
			var captureFlags uint32
			framesRead := framesAvailable
			hr = int32(callCOM(
				comMethod(captureClient, 3),
				captureClient,
				uintptr(unsafe.Pointer(&dataPointer)),
				uintptr(unsafe.Pointer(&framesRead)),
				uintptr(unsafe.Pointer(&captureFlags)),
				0,
				0,
			))
			if !succeeded(hr) {
				return fmt.Errorf("IAudioCaptureClient::GetBuffer failed: HRESULT 0x%08X", uint32(hr))
			}

			mono := make([]float32, int(framesRead))
			if dataPointer != 0 && captureFlags&audclntBufferflagsSilent == 0 {
				dataLength := int(framesRead) * int(format.blockAlign)
				data := unsafe.Slice((*byte)(unsafe.Pointer(dataPointer)), dataLength)
				for frame := 0; frame < int(framesRead); frame++ {
					for channel := 0; channel < int(format.channels); channel++ {
						mono[frame] += readSample(data, frame, channel, &format, floatFormat)
					}
					mono[frame] /= float32(format.channels)
				}
			}

			output := resampler.append(mono)
			writeErr := writePCM(output)
			hr = int32(callCOM(comMethod(captureClient, 4), captureClient, uintptr(framesRead)))
			if !succeeded(hr) {
				return fmt.Errorf("IAudioCaptureClient::ReleaseBuffer failed: HRESULT 0x%08X", uint32(hr))
			}
			if writeErr != nil {
				return fmt.Errorf("write PCM stdout: %w", writeErr)
			}

			hr = int32(callCOM(
				comMethod(captureClient, 5),
				captureClient,
				uintptr(unsafe.Pointer(&framesAvailable)),
			))
			if !succeeded(hr) {
				return fmt.Errorf("IAudioCaptureClient::GetNextPacketSize failed: HRESULT 0x%08X", uint32(hr))
			}
		}
	}
	return nil
}

func run() error {
	if len(os.Args) != 3 || os.Args[2] != "exclude" {
		return fmt.Errorf("usage: cosight-system-audio-loopback.exe <cosight-pid> exclude")
	}
	processID, err := strconv.ParseUint(os.Args[1], 10, 32)
	if err != nil || processID == 0 {
		return fmt.Errorf("invalid process id: %s", os.Args[1])
	}

	hr, _, _ := procCoInitializeEx.Call(0, uintptr(coinitMultithreaded))
	if int32(hr) < 0 {
		return fmt.Errorf("CoInitializeEx failed: HRESULT 0x%08X", uint32(hr))
	}
	defer procCoUninitialize.Call()

	var stop atomic.Bool
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)
	defer signal.Stop(interrupt)
	go func() {
		<-interrupt
		stop.Store(true)
	}()

	return captureAudio(uint32(processID), &stop)
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "system-audio-loopback: %v\n", err)
		os.Exit(1)
	}
}
