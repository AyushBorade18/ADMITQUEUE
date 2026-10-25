// Minimal JSON reader/writer used by the engine's stdin/stdout protocol.
//
// Written for this project (no third-party code, so there is no extra licence to document).
// Supports: null, true/false, numbers, strings (with \uXXXX and surrogate pairs), arrays, objects.
// Safety limits: maximum nesting depth 64; the caller limits the total input size.
// Errors are reported with the exception `JsonError`; the engine turns them into {"ok":false,...}.
#ifndef ADMITQUEUE_JSON_HPP
#define ADMITQUEUE_JSON_HPP

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace aqjson {

struct JsonError : public std::runtime_error {
  explicit JsonError(const std::string& m) : std::runtime_error(m) {}
};

class Value {
 public:
  enum Type { Null, Bool, Number, String, Array, Object };

  Value() : type_(Null) {}
  static Value boolean(bool b) { Value v; v.type_ = Bool; v.bool_ = b; return v; }
  static Value number(double d) { Value v; v.type_ = Number; v.num_ = d; return v; }
  static Value integer(long long i) { Value v; v.type_ = Number; v.num_ = static_cast<double>(i); v.int_ = i; v.isInt_ = true; return v; }
  static Value string(const std::string& s) { Value v; v.type_ = String; v.str_ = s; return v; }
  static Value array() { Value v; v.type_ = Array; return v; }
  static Value object() { Value v; v.type_ = Object; return v; }

  Type type() const { return type_; }
  bool isNull() const { return type_ == Null; }
  bool isBool() const { return type_ == Bool; }
  bool isNumber() const { return type_ == Number; }
  bool isString() const { return type_ == String; }
  bool isArray() const { return type_ == Array; }
  bool isObject() const { return type_ == Object; }

  bool asBool() const { need(Bool, "boolean"); return bool_; }
  double asDouble() const { need(Number, "number"); return num_; }
  long long asInt() const {
    need(Number, "number");
    if (isInt_) return int_;
    if (std::floor(num_) != num_ || std::fabs(num_) > 9.0e15) throw JsonError("expected an integer");
    return static_cast<long long>(num_);
  }
  const std::string& asString() const { need(String, "string"); return str_; }
  const std::vector<Value>& items() const { need(Array, "array"); return arr_; }
  const std::vector<std::pair<std::string, Value>>& members() const { need(Object, "object"); return obj_; }

  // Object access: returns nullptr when the key is missing.
  const Value* find(const std::string& key) const {
    need(Object, "object");
    for (const auto& kv : obj_) if (kv.first == key) return &kv.second;
    return nullptr;
  }
  const Value& at(const std::string& key) const {
    const Value* v = find(key);
    if (v == nullptr) throw JsonError("missing field \"" + key + "\"");
    return *v;
  }
  bool has(const std::string& key) const { return type_ == Object && find(key) != nullptr; }

  // Builders
  Value& push(const Value& v) { need(Array, "array"); arr_.push_back(v); return *this; }
  Value& set(const std::string& key, const Value& v) {
    need(Object, "object");
    for (auto& kv : obj_) if (kv.first == key) { kv.second = v; return *this; }
    obj_.push_back({key, v});
    return *this;
  }

  std::string dump() const { std::string out; write(out); return out; }

 private:
  void need(Type t, const char* what) const {
    if (type_ != t) throw JsonError(std::string("expected ") + what);
  }

  static void writeString(std::string& out, const std::string& s) {
    out += '"';
    for (unsigned char c : s) {
      switch (c) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
          if (c < 0x20) { char buf[8]; std::snprintf(buf, sizeof buf, "\\u%04x", c); out += buf; }
          else out += static_cast<char>(c);
      }
    }
    out += '"';
  }

  void write(std::string& out) const {
    switch (type_) {
      case Null: out += "null"; break;
      case Bool: out += bool_ ? "true" : "false"; break;
      case Number: {
        if (isInt_) { out += std::to_string(int_); break; }
        if (!std::isfinite(num_)) { out += "null"; break; }
        char buf[48];
        std::snprintf(buf, sizeof buf, "%.10g", num_);
        out += buf;
        break;
      }
      case String: writeString(out, str_); break;
      case Array:
        out += '[';
        for (std::size_t i = 0; i < arr_.size(); ++i) { if (i) out += ','; arr_[i].write(out); }
        out += ']';
        break;
      case Object:
        out += '{';
        for (std::size_t i = 0; i < obj_.size(); ++i) {
          if (i) out += ',';
          writeString(out, obj_[i].first);
          out += ':';
          obj_[i].second.write(out);
        }
        out += '}';
        break;
    }
  }

  Type type_;
  bool bool_ = false;
  double num_ = 0;
  long long int_ = 0;
  bool isInt_ = false;
  std::string str_;
  std::vector<Value> arr_;
  std::vector<std::pair<std::string, Value>> obj_;
};

class Parser {
 public:
  explicit Parser(const std::string& text) : s_(text) {}

  Value parse() {
    skipWs();
    Value v = parseValue(0);
    skipWs();
    if (pos_ != s_.size()) fail("unexpected data after the JSON value");
    return v;
  }

 private:
  [[noreturn]] void fail(const std::string& m) const {
    throw JsonError("invalid JSON at offset " + std::to_string(pos_) + ": " + m);
  }
  void skipWs() { while (pos_ < s_.size() && (s_[pos_] == ' ' || s_[pos_] == '\t' || s_[pos_] == '\n' || s_[pos_] == '\r')) ++pos_; }
  char peek() const { return pos_ < s_.size() ? s_[pos_] : '\0'; }
  bool eof() const { return pos_ >= s_.size(); }

  Value parseValue(int depth) {
    if (depth > 64) fail("nesting too deep");
    if (eof()) fail("unexpected end of input");
    char c = s_[pos_];
    if (c == '{') return parseObject(depth);
    if (c == '[') return parseArray(depth);
    if (c == '"') return Value::string(parseString());
    if (c == 't') { expectWord("true"); return Value::boolean(true); }
    if (c == 'f') { expectWord("false"); return Value::boolean(false); }
    if (c == 'n') { expectWord("null"); return Value(); }
    if (c == '-' || (c >= '0' && c <= '9')) return parseNumber();
    fail("unexpected character");
  }

  void expectWord(const char* w) {
    std::string word(w);
    if (s_.compare(pos_, word.size(), word) != 0) fail("bad literal");
    pos_ += word.size();
  }

  Value parseNumber() {
    std::size_t start = pos_;
    bool isFloat = false;
    if (peek() == '-') ++pos_;
    if (!(peek() >= '0' && peek() <= '9')) fail("bad number");
    if (peek() == '0') { ++pos_; }
    else while (peek() >= '0' && peek() <= '9') ++pos_;
    if (peek() == '.') {
      isFloat = true; ++pos_;
      if (!(peek() >= '0' && peek() <= '9')) fail("bad number");
      while (peek() >= '0' && peek() <= '9') ++pos_;
    }
    if (peek() == 'e' || peek() == 'E') {
      isFloat = true; ++pos_;
      if (peek() == '+' || peek() == '-') ++pos_;
      if (!(peek() >= '0' && peek() <= '9')) fail("bad number");
      while (peek() >= '0' && peek() <= '9') ++pos_;
    }
    std::string text = s_.substr(start, pos_ - start);
    if (!isFloat && text.size() < 16) return Value::integer(std::strtoll(text.c_str(), nullptr, 10));
    return Value::number(std::strtod(text.c_str(), nullptr));
  }

  static void appendUtf8(std::string& out, unsigned cp) {
    if (cp < 0x80) out += static_cast<char>(cp);
    else if (cp < 0x800) { out += static_cast<char>(0xC0 | (cp >> 6)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
    else if (cp < 0x10000) { out += static_cast<char>(0xE0 | (cp >> 12)); out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
    else { out += static_cast<char>(0xF0 | (cp >> 18)); out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F)); out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
  }

  unsigned parseHex4() {
    if (pos_ + 4 > s_.size()) fail("bad \\u escape");
    unsigned v = 0;
    for (int i = 0; i < 4; ++i) {
      char c = s_[pos_++];
      v <<= 4;
      if (c >= '0' && c <= '9') v |= static_cast<unsigned>(c - '0');
      else if (c >= 'a' && c <= 'f') v |= static_cast<unsigned>(c - 'a' + 10);
      else if (c >= 'A' && c <= 'F') v |= static_cast<unsigned>(c - 'A' + 10);
      else fail("bad \\u escape");
    }
    return v;
  }

  std::string parseString() {
    ++pos_;  // opening quote
    std::string out;
    while (true) {
      if (eof()) fail("unterminated string");
      char c = s_[pos_++];
      if (c == '"') break;
      if (static_cast<unsigned char>(c) < 0x20) fail("control character in string");
      if (c != '\\') { out += c; continue; }
      if (eof()) fail("bad escape");
      char e = s_[pos_++];
      switch (e) {
        case '"': out += '"'; break;
        case '\\': out += '\\'; break;
        case '/': out += '/'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'n': out += '\n'; break;
        case 'r': out += '\r'; break;
        case 't': out += '\t'; break;
        case 'u': {
          unsigned cp = parseHex4();
          if (cp >= 0xD800 && cp <= 0xDBFF) {
            if (s_.compare(pos_, 2, "\\u") != 0) fail("lone surrogate");
            pos_ += 2;
            unsigned lo = parseHex4();
            if (lo < 0xDC00 || lo > 0xDFFF) fail("bad surrogate pair");
            cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
          } else if (cp >= 0xDC00 && cp <= 0xDFFF) {
            fail("lone surrogate");
          }
          appendUtf8(out, cp);
          break;
        }
        default: fail("bad escape");
      }
    }
    return out;
  }

  Value parseArray(int depth) {
    ++pos_;
    Value arr = Value::array();
    skipWs();
    if (peek() == ']') { ++pos_; return arr; }
    while (true) {
      skipWs();
      arr.push(parseValue(depth + 1));
      skipWs();
      if (peek() == ',') { ++pos_; continue; }
      if (peek() == ']') { ++pos_; break; }
      fail("expected , or ]");
    }
    return arr;
  }

  Value parseObject(int depth) {
    ++pos_;
    Value obj = Value::object();
    skipWs();
    if (peek() == '}') { ++pos_; return obj; }
    while (true) {
      skipWs();
      if (peek() != '"') fail("expected a string key");
      std::string key = parseString();
      skipWs();
      if (peek() != ':') fail("expected :");
      ++pos_;
      skipWs();
      obj.set(key, parseValue(depth + 1));
      skipWs();
      if (peek() == ',') { ++pos_; continue; }
      if (peek() == '}') { ++pos_; break; }
      fail("expected , or }");
    }
    return obj;
  }

  const std::string& s_;
  std::size_t pos_ = 0;
};

inline Value parse(const std::string& text) { return Parser(text).parse(); }

}  // namespace aqjson

#endif
