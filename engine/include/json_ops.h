// JSON request/response layer of the AdmitQueue engine.
//
// The web server starts the engine program once per operation, writes ONE JSON request to its standard input
// and reads ONE JSON reply from its standard output (diagnostics go to standard error). The engine keeps no
// state between requests: everything it needs is in the request, and PostgreSQL stays the source of truth.
//
// Request:  {"op":"<name>", ...fields}
// Reply:    {"ok":true,"op":"<name>","engine":"admitqueue-engine/1.0","result":{...}}
//           {"ok":false,"error":"<CODE>","message":"..."}
#ifndef ADMITQUEUE_JSON_OPS_H
#define ADMITQUEUE_JSON_OPS_H

#include <string>

namespace admitqueue {

extern const char* const ENGINE_NAME;     // "admitqueue-engine/1.0"

// Parses and runs one request. Never throws: every problem becomes {"ok":false,...}.
std::string handleRequest(const std::string& requestText);

}  // namespace admitqueue

#endif
