// Allotment demo: the idea behind the website's Allotment page, in about 60 lines.
// Students are sorted by rank (bubble sort). Each student gets the first course on his/her list
// that still has a free seat. Students without a seat wait in a queue.
// Run:  g++ 08_allotment_demo.cpp -o allotment_demo   then   ./allotment_demo
#include <iostream>
#include <string>
using namespace std;

const int S = 6;  // students
const int C = 3;  // courses

int main() {
    string courseName[C] = {"Computer Engg", "Information Tech", "Mechanical"};
    int seats[C] = {2, 1, 2};

    string name[S] = {"Kadam Aarav", "Patil Diya", "Shinde Kabir", "Joshi Meera", "Pawar Rohan", "More Isha"};
    int rank[S] = {3, 1, 5, 2, 6, 4};
    int pref[S][3] = {{0, 1, 2}, {0, 1, 2}, {1, 0, 2}, {0, 2, 1}, {1, 2, 0}, {0, 1, 2}};  // course numbers in order of choice

    // bubble sort of the student numbers by rank (rank 1 first)
    int order[S];
    for (int i = 0; i < S; i++) order[i] = i;
    for (int i = 0; i < S - 1; i++)
        for (int j = 0; j < S - 1 - i; j++)
            if (rank[order[j]] > rank[order[j + 1]]) {
                int t = order[j];
                order[j] = order[j + 1];
                order[j + 1] = t;
            }

    cout << "Rank  Student        Result" << endl;
    for (int k = 0; k < S; k++) {
        int s = order[k];
        int got = -1;
        for (int p = 0; p < 3; p++) {
            int c = pref[s][p];
            if (seats[c] > 0) {
                seats[c]--;
                got = c;
                break;
            }
        }
        cout << rank[s] << "     " << name[s] << "   ";
        if (got == -1) cout << "waiting list" << endl;
        else cout << courseName[got] << endl;
    }

    cout << "\nSeats left: ";
    for (int c = 0; c < C; c++) cout << courseName[c] << "=" << seats[c] << "  ";
    cout << endl;
    return 0;
}
