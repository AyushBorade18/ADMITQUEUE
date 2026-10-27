# C++ folder

Basic C++ only: arrays, linked list, stack, queue, priority queue, bubble sort, linear/binary search. Every file starts with
`using namespace std;` and can be compiled with a plain `g++` command.

```
cpp/
  demos/                    8 menu programs you run in the terminal
    01_array_demo.cpp          insert / delete / largest
    02_linked_list_demo.cpp    traverse, search, insert, delete, sort, join
    03_stack_demo.cpp          array stack, linked stack, balanced brackets
    04_queue_demo.cpp          simple, circular and linked queue
    05_priority_queue_demo.cpp ascending / descending priority queue
    06_sorting_demo.cpp        bubble, selection, insertion sort
    07_searching_demo.cpp      linear and binary search
    08_allotment_demo.cpp      the idea of the website's Allotment page (60 lines)
  engine/main.cpp           the small program the website starts (same style, no menu)
  build.bat / build.sh      compile everything into cpp/build/
```

## Run a demo (terminal)

Windows (PowerShell, needs g++ from MinGW / MSYS2 on PATH):

```
cd cpp
g++ demos/02_linked_list_demo.cpp -o linked_list_demo
.\linked_list_demo
```

Or build all of them at once with `.\build.bat` and run `.\build\02_linked_list_demo.exe`.

Linux / macOS: `./build.sh` and then `./build/02_linked_list_demo`.

## Try the website's engine by hand

```
echo health | build/engine
echo undo_top 3 11 12 13 | build/engine          (prints TOP 13: the stack gives back the newest)
```

PowerShell: `"undo_top 3 11 12 13" | .\build\engine.exe`

The commands are listed at the top of each function in `engine/main.cpp` (input format and output lines).
