package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTestHTTPModelConnection(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("unexpected authorization header: %q", request.Header.Get("Authorization"))
		}
		_, _ = writer.Write([]byte(`{"choices":[{"message":{"content":"pong"}}]}`))
	}))
	defer server.Close()

	err := testHTTPModelConnection(context.Background(), modelProfile{
		Name:   "test-model",
		URL:    server.URL,
		APIKey: "test-key",
	}, server.URL)
	if err != nil {
		t.Fatalf("testHTTPModelConnection failed: %v", err)
	}
}

func TestTestModelConnectionRejectsUnknownModule(t *testing.T) {
	err := testModelConnection(context.Background(), modelProfile{Name: "test", APIKey: "key"}, "unknown")
	if err == nil {
		t.Fatal("expected unknown Harness module to be rejected")
	}
}
