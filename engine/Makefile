# Optional convenience wrapper (the project normally builds with: npm run build:engine)
CXX      ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Iinclude
LIB      := $(filter-out src/main.cpp,$(wildcard src/*.cpp))
TESTS    := $(patsubst tests/%.cpp,build/%,$(wildcard tests/test_*.cpp))

all: build/admitqueue_engine

build/admitqueue_engine: $(wildcard src/*.cpp include/*.h include/*.hpp include/*/*.hpp)
	@mkdir -p build
	$(CXX) $(CXXFLAGS) src/*.cpp -o $@

build/test_%: tests/test_%.cpp $(LIB) $(wildcard include/*.h include/*.hpp include/*/*.hpp)
	@mkdir -p build
	$(CXX) $(CXXFLAGS) $(LIB) $< -o $@

test: $(TESTS)
	@for t in $(TESTS); do ./$$t | tail -1 || exit 1; done

.PHONY: all test
