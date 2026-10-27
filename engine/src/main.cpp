// AdmitQueue engine - program entry point.
//
//   admitqueue_engine                  read ONE JSON request from stdin, write ONE JSON reply to stdout
//   admitqueue_engine --version        print the engine name
//   admitqueue_engine --line-mode [n]  the original interactive text protocol of the queue/toolkit (for demos)
//
// Standard output carries only the protocol reply. Diagnostics go to standard error.
// Exit codes: 0 = a reply was written (it may still say {"ok":false}), 1 = empty input / I/O problem, 3 = crash.
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <iterator>
#include <string>

#include "json_ops.h"
#include "protocol.h"
#include "toolkit.h"

namespace {

const std::size_t MAX_REQUEST_BYTES = 16u * 1024u * 1024u;

int lineMode(int fairness) {
  admitflow::Toolkit toolkit(fairness);
  std::string line;
  bool quit = false;
  while (!quit && std::getline(std::cin, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    std::cout << admitflow::handleToolkitLine(toolkit, line, quit) << "\n" << std::flush;
  }
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  std::ios::sync_with_stdio(false);
  if (argc > 1 && std::strcmp(argv[1], "--version") == 0) {
    std::cout << admitqueue::ENGINE_NAME << "\n";
    return 0;
  }
  if (argc > 1 && std::strcmp(argv[1], "--line-mode") == 0) {
    return lineMode(argc > 2 ? std::atoi(argv[2]) : 3);
  }
  try {
    std::string request((std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>());
    if (request.empty()) {
      std::cerr << "engine: empty request on stdin\n";
      std::cout << "{\"ok\":false,\"error\":\"EMPTY_REQUEST\",\"message\":\"No request was received.\"}\n";
      return 1;
    }
    if (request.size() > MAX_REQUEST_BYTES) {
      std::cout << "{\"ok\":false,\"error\":\"TOO_LARGE\",\"message\":\"Request is too large.\"}\n";
      return 0;
    }
    std::cout << admitqueue::handleRequest(request) << "\n";
    return 0;
  } catch (const std::exception& e) {
    std::cerr << "engine: fatal: " << e.what() << "\n";
    std::cout << "{\"ok\":false,\"error\":\"ENGINE_CRASH\",\"message\":\"The engine failed.\"}\n";
    return 3;
  }
}
