# FODS mapping: what is C++ and what is Next.js

The C++ part is small on purpose. It uses only arrays, a linked list, a stack, a queue, a priority queue, bubble sort and
linear search. Everything else (login, database, pages, buttons, security, PWA) is Next.js, React and Supabase.

The website starts one small program, `cpp/build/engine`, writes a few words and numbers to it and reads the answer lines
back (`src/lib/engine/client.ts`). The program keeps nothing between calls; the database is the only storage.

If the C++ program could not be built on a machine (no `g++`), the website uses a TypeScript copy of the same steps
(`src/lib/engine/fallback.ts`). The admin dashboard and `/api/health/engine` say which one is running
(`"mode":"cpp"` or `"mode":"typescript"`). A unit test checks that both give exactly the same answers.

| Concept | Where in `cpp/engine/main.cpp` | Where you see it in the website | Engine command |
|---|---|---|---|
| **Array** | `grid[][]`, `cnt[][]`, `st[]`, `ids[]` | Admin -> *Planner*: appointments per day and slot, document readiness table | `load`, `readiness` |
| **Linked list + queue (FIFO)** | `class Queue` (nodes with `next`) | Admin -> *Service desk*: regular students are served first come, first served; students without a seat in *Allotment* go to the waiting queue | `next_call`, `allot` |
| **Priority queue** | `class PriorityQueue` (sorted array, insertion) | Admin -> *Service desk*: urgent tokens (level 1-2) are called before regular ones, with a fairness rule after 3 priority calls | `next_call` |
| **Stack** | `class Stack` (array) | Admin -> *Audit and undo*: the newest change is on top and is the only one that can be undone | `undo_top` |
| **Sorting (bubble sort)** | `sortDesc()` and the rank sort inside `allot()` | Admin -> *Allotment* (students sorted by merit rank), *Planner* follow-up list (most work left first) | `sort_desc`, `allot` |
| **Searching (linear search)** | `searchStudents()`, `importCheck()` | Admin -> *Students* search by CAP ID prefix or name (shows the number of comparisons); *CAP records* CSV import marks IDs as new / repeated / already stored | `search`, `import_check` |

## Run the same ideas in a terminal

The folder `cpp/demos/` has eight menu programs in the same simple style (array, linked list, stack, queue, priority queue,
sorting, searching and a 60-line allotment). See `cpp/README.md`.

## What is not C++

Login and sessions (Supabase Auth), the database and its security rules (PostgreSQL), all pages and forms (Next.js / React),
the audit log, notifications, documents checklist, appointments, CSV export, the installable app (PWA). Please describe the
project that way: C++ does the searching, sorting, queue/stack steps and the allotment; Next.js does the rest.
