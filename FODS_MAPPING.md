<<<<<<< HEAD
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
=======
# FODS mapping: where each data structure and algorithm is used

All of these live in the C++ engine (`engine/`) and are called by the website through `src/lib/engine/` (one JSON request on
stdin, one JSON reply on stdout; the process is stateless and started per call). To show an examiner, run the engine
directly: `engine/build/admitqueue_engine` reads one JSON request from standard input, e.g.

```
echo {"op":"health"} | engine\build\admitqueue_engine          (Windows cmd)
echo '{"op":"health"}' | ./engine/build/admitqueue_engine      (Linux/macOS)
```

| Concept | C++ code | Website feature (where to click) | Engine `op` |
|---|---|---|---|
| **Queue (FIFO)** | `FifoQueue` in `engine/include/dsa/fifo_queue.hpp` (used by `QueueEngine`); `SimQueue` (linked-list queue) in `engine/include/allotment.h` | Admin -> *Service desk* regular lane; *Link requests* are reviewed oldest-first; allotment verification queue + waiting list | `queue_step`, `allotment` (`verify_next`, `promote`) |
| **Priority queue / binary min-heap** | `MinHeap` in `engine/include/dsa/min_heap.hpp`, ordered by (level, seq) | Admin -> *Service desk*: priority tokens (level 1-2) are called before regular ones, with a fairness rule after 3 priority calls | `queue_step` |
| **Max-heap + hash map** | `AdmissionProgressHeap` in `engine/include/progress_queue.h` | Admin -> *Planner* -> follow-up list (students with most work left first) | `progress_rank` |
| **Hash table** | `HashMap` in `engine/include/dsa/hash_map.hpp` (FNV-1a string hash) | Admin -> *CAP records* -> CSV import classifies every CAP ID as new / repeated in the file / already stored; active-token lookup in the queue | `import_check`, `hash_lookup`, `queue_step` |
| **Binary search** | `SearchIndex` (`engine/include/search_index.h`, `algo/search.hpp`) on the sorted CAP ID list | Admin -> *Students* search by CAP ID prefix (the page shows the algorithm and the comparison count) | `search` (`app_prefix`) |
| **Linear search** | on names | Admin -> *Students* search by name | `search` (`name`) |
| **Stable merge sort** | `engine/include/algo/merge_sort.hpp` (used by `sortWork` in `planner`) | Worklist ordering (arrival time / priority / token) | `rank_worklist` |
| **Bubble sort** | `AllotmentSimulator::sortMerit` (from Project (1)) | Admin -> *Allotment demo* sorts candidates by merit before allotting | `allotment` |
| **Singly linked list** | `SimNode` chain in `AllotmentSimulator` (from Project (1)) | Admin -> *Allotment demo* stores the students | `allotment` |
| **Stack (LIFO)** | `Stack` (`engine/include/dsa/stack.hpp`) inside `UndoStacks` (`undo_stacks.h`) | Admin -> *Audit & undo*: only the newest change of that admin can be undone | `undo_stack` |
| **Sparse matrix** | `SparseMatrix` in `engine/include/dsa/sparse_matrix.hpp` (stores only non-zero cells; reports in `reports.h`) | Admin -> *Planner* appointment load: 7 days x 48 half-hour slots, mostly empty | `appointment_load` |
| **Dense matrix (2-D array)** | `DenseMatrix` in `engine/include/dsa/dense_matrix.hpp` | Admin -> *Planner* document readiness: documents x workflow stages | `doc_readiness` |
| **Round-wise allotment (Project (1))** | `AllotmentSimulator::runRound1/runRound2/tryAllocate` | Seed step uses it for round 1; Admin -> *Allotment demo* preview/apply rounds 1 and 2 | `allotment` |

## How to demonstrate (5 minutes)

1. `npm run test:engine`: shows the C++ test programs passing (hundreds of checks).
2. Admin -> Students: search `DM2600` (binary search) and then a name (linear search); note the comparison counts printed under the search box.
3. Admin -> Service desk: students have waiting tokens (seed). Press *Call next* on Counter 1: a priority token (P...) is called before regular (R...) ones; after three priority calls a regular one goes next (fairness).
4. Admin -> Records -> paste a CSV with a repeated and an existing CAP ID -> *Check only* (hash table).
5. Admin -> Allotment demo -> *Preview round 1*, then show the stored seat limits are never exceeded.
6. Make a change on a student's page, then Admin -> Audit & undo -> *Undo* (stack: only the latest).

## Where the web app and the algorithms meet (important to explain)

The database keeps the data (PostgreSQL). The C++ engine does the algorithmic work on data that Node passes in and
returns a result; it never touches the database. The route code (`src/app/api/admin/*`) is the glue. The queue is
protected by a version number in the database, so two staff clicking at the same time cannot corrupt it.

## Honest limits

* The allotment is a **simulation** for learning, not the official CAP algorithm or result.
* Engine calls spawn a process per request (simple and safe, adequate for a classroom); a production system with high traffic would keep a long-running engine or use a library.
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
