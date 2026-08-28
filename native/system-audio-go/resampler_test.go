//go:build windows && amd64

package main

import (
	"encoding/binary"
	"math"
	"os"
	"testing"
)

func TestResamplerProduces16kOutput(t *testing.T) {
	r := newResampler(48_000)
	input := make([]float32, 480)
	output := r.append(input)
	if len(output) != 160 {
		t.Fatalf("expected 160 output samples, got %d", len(output))
	}
	output = append(output, r.append(input)...)
	if len(output) != 320 {
		t.Fatalf("expected 320 output samples after two packets, got %d", len(output))
	}
}

func TestResamplerClampsSamplesBeforePCMEncoding(t *testing.T) {
	r := newResampler(16_000)
	output := r.append([]float32{2, -2})
	if len(output) != 1 {
		t.Fatalf("expected one output sample, got %d", len(output))
	}
	if output[0] != 32767 {
		t.Fatalf("expected positive sample to be clamped, got %d", output[0])
	}
	output = r.append([]float32{-2, 0})
	if len(output) != 2 || output[0] != -32767 || output[1] != -32767 {
		t.Fatalf("expected negative sample to be clamped after buffering, got %v", output)
	}
}

func TestReadSampleSupportsCommonPCMFormats(t *testing.T) {
	pcm16 := waveFormatEx{bitsPerSample: 16, blockAlign: 2}
	if got := readSample([]byte{0x00, 0x80}, 0, 0, &pcm16, false); got != -1 {
		t.Fatalf("expected signed 16-bit minimum to normalize to -1, got %v", got)
	}

	pcm24 := waveFormatEx{bitsPerSample: 24, blockAlign: 3}
	if got := readSample([]byte{0x00, 0x00, 0x80}, 0, 0, &pcm24, false); got != -1 {
		t.Fatalf("expected signed 24-bit minimum to normalize to -1, got %v", got)
	}

	pcm32 := waveFormatEx{bitsPerSample: 32, blockAlign: 4}
	pcm32Data := make([]byte, 4)
	binary.LittleEndian.PutUint32(pcm32Data, 0x80000000)
	if got := readSample(pcm32Data, 0, 0, &pcm32, false); got != -1 {
		t.Fatalf("expected signed 32-bit minimum to normalize to -1, got %v", got)
	}

	float32Format := waveFormatEx{bitsPerSample: 32, blockAlign: 4}
	float32Data := make([]byte, 4)
	binary.LittleEndian.PutUint32(float32Data, math.Float32bits(0.25))
	if got := readSample(float32Data, 0, 0, &float32Format, true); got != 0.25 {
		t.Fatalf("expected IEEE float sample to be preserved, got %v", got)
	}
}

func TestReadSampleReturnsSilenceForInvalidBounds(t *testing.T) {
	format := waveFormatEx{bitsPerSample: 16, blockAlign: 2}
	if got := readSample([]byte{0x01}, 0, 0, &format, false); got != 0 {
		t.Fatalf("short sample should be treated as silence, got %v", got)
	}
	if got := readSample([]byte{0x01, 0x00}, 1, 0, &format, false); got != 0 {
		t.Fatalf("out-of-range frame should be treated as silence, got %v", got)
	}
}

func TestRunRejectsInvalidArgumentsBeforeTouchingWindowsAudio(t *testing.T) {
	originalArgs := os.Args
	defer func() { os.Args = originalArgs }()
	os.Args = []string{"cosight-system-audio-loopback.exe"}
	if err := run(); err == nil {
		t.Fatal("expected invalid command line to be rejected")
	}
}
