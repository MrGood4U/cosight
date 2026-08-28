#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <ksmedia.h>
#include <mmdeviceapi.h>
#include <wrl/client.h>
#include <wrl/implements.h>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <fcntl.h>
#include <io.h>
#include <cwchar>
#include <vector>

#pragma comment(lib, "ole32.lib")

#ifndef VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK
#define VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK L"VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK"
#endif

namespace {

using Microsoft::WRL::ComPtr;

constexpr double kOutputSampleRate = 16000.0;
std::atomic_bool g_stop{false};

BOOL WINAPI consoleHandler(DWORD signal) {
  if (signal == CTRL_C_EVENT || signal == CTRL_BREAK_EVENT || signal == CTRL_CLOSE_EVENT || signal == CTRL_LOGOFF_EVENT || signal == CTRL_SHUTDOWN_EVENT) {
    g_stop.store(true);
    return TRUE;
  }
  return FALSE;
}

void printHresult(const char* operation, HRESULT hr) {
  std::fprintf(stderr, "system-audio-loopback: %s failed with HRESULT 0x%08lX\n", operation, static_cast<unsigned long>(hr));
}

class ActivationHandler final : public Microsoft::WRL::RuntimeClass<
  Microsoft::WRL::RuntimeClassFlags<Microsoft::WRL::ClassicCom>,
  Microsoft::WRL::FtmBase,
  IActivateAudioInterfaceCompletionHandler> {
 public:
  explicit ActivationHandler(HANDLE completedEvent) : completedEvent_(completedEvent) {}

  HRESULT STDMETHODCALLTYPE ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
    HRESULT activationResult = E_UNEXPECTED;
    ComPtr<IUnknown> activatedInterface;
    HRESULT hr = operation->GetActivateResult(&activationResult, &activatedInterface);
    if (SUCCEEDED(hr)) hr = activationResult;
    if (SUCCEEDED(hr)) hr = activatedInterface.As(&audioClient_);
    result_ = hr;
    SetEvent(completedEvent_);
    return S_OK;
  }

  HRESULT result() const { return result_; }

  ComPtr<IAudioClient> audioClient() const { return audioClient_; }

 private:
  HANDLE completedEvent_;
  HRESULT result_{E_UNEXPECTED};
  ComPtr<IAudioClient> audioClient_;
};

bool isFloatFormat(const WAVEFORMATEX* format) {
  if (format->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) return true;
  if (format->wFormatTag != WAVE_FORMAT_EXTENSIBLE || format->cbSize < sizeof(WAVEFORMATEXTENSIBLE) - sizeof(WAVEFORMATEX)) return false;
  const auto* extensible = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(format);
  return IsEqualGUID(extensible->SubFormat, KSDATAFORMAT_SUBTYPE_IEEE_FLOAT) != FALSE;
}

float readSample(const BYTE* data, size_t frame, size_t channel, const WAVEFORMATEX* format, bool floatFormat) {
  const size_t bytesPerSample = format->wBitsPerSample / 8;
  const BYTE* sample = data + frame * format->nBlockAlign + channel * bytesPerSample;
  if (floatFormat && format->wBitsPerSample == 32) {
    return *reinterpret_cast<const float*>(sample);
  }
  if (format->wBitsPerSample == 16) {
    return static_cast<float>(*reinterpret_cast<const int16_t*>(sample)) / 32768.0f;
  }
  if (format->wBitsPerSample == 24) {
    int32_t value = static_cast<int32_t>(sample[0])
      | (static_cast<int32_t>(sample[1]) << 8)
      | (static_cast<int32_t>(sample[2]) << 16);
    if ((value & 0x00800000) != 0) value |= ~0x00FFFFFF;
    return static_cast<float>(value) / 8388608.0f;
  }
  if (format->wBitsPerSample == 32) {
    return static_cast<float>(*reinterpret_cast<const int32_t*>(sample)) / 2147483648.0f;
  }
  return 0.0f;
}

class Resampler {
 public:
  explicit Resampler(double inputRate) : step_(inputRate / kOutputSampleRate) {}

  void append(const std::vector<float>& input, std::vector<int16_t>& output) {
    samples_.insert(samples_.end(), input.begin(), input.end());
    while (position_ + 1.0 < static_cast<double>(samples_.size())) {
      const size_t index = static_cast<size_t>(position_);
      const double fraction = position_ - static_cast<double>(index);
      const float sample = static_cast<float>(samples_[index] * (1.0 - fraction) + samples_[index + 1] * fraction);
      const float clipped = std::max(-1.0f, std::min(1.0f, sample));
      output.push_back(static_cast<int16_t>(std::lrint(clipped * 32767.0f)));
      position_ += step_;
    }
    const size_t consumed = static_cast<size_t>(position_);
    if (consumed > 0) {
      samples_.erase(samples_.begin(), samples_.begin() + static_cast<std::ptrdiff_t>(consumed));
      position_ -= static_cast<double>(consumed);
    }
  }

 private:
  double step_;
  double position_{0.0};
  std::vector<float> samples_;
};

bool writeStdout(const std::vector<int16_t>& samples) {
  if (samples.empty()) return true;
  const HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
  if (output == nullptr || output == INVALID_HANDLE_VALUE) return false;
  const BYTE* bytes = reinterpret_cast<const BYTE*>(samples.data());
  DWORD remaining = static_cast<DWORD>(samples.size() * sizeof(int16_t));
  while (remaining > 0) {
    DWORD written = 0;
    if (!WriteFile(output, bytes, remaining, &written, nullptr) || written == 0) return false;
    bytes += written;
    remaining -= written;
  }
  return true;
}

HRESULT activateProcessLoopback(DWORD excludedProcessId, ComPtr<IAudioClient>& audioClient) {
  HANDLE completedEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (!completedEvent) return HRESULT_FROM_WIN32(GetLastError());

  auto* handler = new ActivationHandler(completedEvent);
  AUDIOCLIENT_ACTIVATION_PARAMS activationParams{};
  activationParams.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  activationParams.ProcessLoopbackParams.TargetProcessId = excludedProcessId;
  activationParams.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT activateParams{};
  activateParams.vt = VT_BLOB;
  activateParams.blob.cbSize = sizeof(activationParams);
  activateParams.blob.pBlobData = reinterpret_cast<BYTE*>(&activationParams);

  ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
  HRESULT hr = ActivateAudioInterfaceAsync(
    VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
    __uuidof(IAudioClient),
    &activateParams,
    handler,
    &operation
  );
  if (FAILED(hr)) {
    handler->Release();
    CloseHandle(completedEvent);
    return hr;
  }

  const DWORD waitResult = WaitForSingleObject(completedEvent, 10000);
  if (waitResult != WAIT_OBJECT_0) {
    handler->Release();
    CloseHandle(completedEvent);
    return waitResult == WAIT_TIMEOUT ? HRESULT_FROM_WIN32(ERROR_TIMEOUT) : HRESULT_FROM_WIN32(GetLastError());
  }
  hr = handler->result();
  if (SUCCEEDED(hr)) audioClient = handler->audioClient();
  handler->Release();
  CloseHandle(completedEvent);
  return hr;
}

HRESULT captureAudio(DWORD excludedProcessId) {
  ComPtr<IAudioClient> audioClient;
  HRESULT hr = activateProcessLoopback(excludedProcessId, audioClient);
  if (FAILED(hr)) return hr;

  WAVEFORMATEX* mixFormat = nullptr;
  hr = audioClient->GetMixFormat(&mixFormat);
  if (FAILED(hr)) return hr;

  if (mixFormat->nChannels == 0 || mixFormat->nSamplesPerSec == 0 || mixFormat->nBlockAlign == 0) {
    CoTaskMemFree(mixFormat);
    return E_INVALIDARG;
  }

  constexpr REFERENCE_TIME kBufferDuration = 1'000'000; // 100 ms.
  const DWORD streamFlags = AUDCLNT_STREAMFLAGS_LOOPBACK
    | AUDCLNT_STREAMFLAGS_EVENTCALLBACK
    | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
    | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
  hr = audioClient->Initialize(AUDCLNT_SHAREMODE_SHARED, streamFlags, kBufferDuration, 0, mixFormat, nullptr);
  if (FAILED(hr)) {
    CoTaskMemFree(mixFormat);
    return hr;
  }

  HANDLE sampleReadyEvent = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (!sampleReadyEvent) {
    CoTaskMemFree(mixFormat);
    return HRESULT_FROM_WIN32(GetLastError());
  }
  hr = audioClient->SetEventHandle(sampleReadyEvent);
  if (FAILED(hr)) {
    CloseHandle(sampleReadyEvent);
    CoTaskMemFree(mixFormat);
    return hr;
  }

  ComPtr<IAudioCaptureClient> captureClient;
  hr = audioClient->GetService(IID_PPV_ARGS(&captureClient));
  if (FAILED(hr)) {
    CloseHandle(sampleReadyEvent);
    CoTaskMemFree(mixFormat);
    return hr;
  }

  hr = audioClient->Start();
  if (FAILED(hr)) {
    CloseHandle(sampleReadyEvent);
    CoTaskMemFree(mixFormat);
    return hr;
  }

  const bool floatFormat = isFloatFormat(mixFormat);
  Resampler resampler(static_cast<double>(mixFormat->nSamplesPerSec));
  std::vector<float> monoSamples;
  std::vector<int16_t> outputSamples;
  bool outputOpen = true;

  while (!g_stop.load() && outputOpen) {
    const DWORD waitResult = WaitForSingleObject(sampleReadyEvent, 1000);
    if (waitResult == WAIT_TIMEOUT) continue;
    if (waitResult != WAIT_OBJECT_0) {
      hr = HRESULT_FROM_WIN32(GetLastError());
      break;
    }

    UINT32 framesAvailable = 0;
    hr = captureClient->GetNextPacketSize(&framesAvailable);
    if (FAILED(hr)) break;
    while (!g_stop.load() && framesAvailable > 0) {
      BYTE* data = nullptr;
      DWORD captureFlags = 0;
      UINT64 devicePosition = 0;
      UINT64 qpcPosition = 0;
      hr = captureClient->GetBuffer(&data, &framesAvailable, &captureFlags, &devicePosition, &qpcPosition);
      if (FAILED(hr)) break;

      monoSamples.clear();
      monoSamples.reserve(framesAvailable);
      for (UINT32 frame = 0; frame < framesAvailable; ++frame) {
        float sample = 0.0f;
        if ((captureFlags & AUDCLNT_BUFFERFLAGS_SILENT) == 0 && data) {
          for (WORD channel = 0; channel < mixFormat->nChannels; ++channel) {
            sample += readSample(data, frame, channel, mixFormat, floatFormat);
          }
          sample /= static_cast<float>(mixFormat->nChannels);
        }
        monoSamples.push_back(sample);
      }

      outputSamples.clear();
      resampler.append(monoSamples, outputSamples);
      if (!writeStdout(outputSamples)) outputOpen = false;
      captureClient->ReleaseBuffer(framesAvailable);
      if (!outputOpen) break;

      hr = captureClient->GetNextPacketSize(&framesAvailable);
      if (FAILED(hr)) break;
    }
    if (FAILED(hr)) break;
  }

  audioClient->Stop();
  CloseHandle(sampleReadyEvent);
  CoTaskMemFree(mixFormat);
  return outputOpen ? S_OK : HRESULT_FROM_WIN32(ERROR_BROKEN_PIPE);
}

} // namespace

int wmain(int argc, wchar_t* argv[]) {
  if (argc != 3 || wcstoul(argv[1], nullptr, 10) == 0 || _wcsicmp(argv[2], L"exclude") != 0) {
    std::fwprintf(stderr, L"Usage: cosight-system-audio-loopback.exe <cosight-pid> exclude\n");
    return 2;
  }

  const DWORD excludedProcessId = wcstoul(argv[1], nullptr, 10);
  SetConsoleCtrlHandler(consoleHandler, TRUE);
  _setmode(_fileno(stdout), _O_BINARY);

  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(hr)) {
    printHresult("CoInitializeEx", hr);
    return 3;
  }

  hr = captureAudio(excludedProcessId);
  if (FAILED(hr) && hr != HRESULT_FROM_WIN32(ERROR_BROKEN_PIPE)) printHresult("captureAudio", hr);
  CoUninitialize();
  return FAILED(hr) && hr != HRESULT_FROM_WIN32(ERROR_BROKEN_PIPE) ? 1 : 0;
}
