#include <cstdio>
#include "assembler/assembler.hpp"

int main() {
  const char* src =
      "COPY   START 1000\n"
      "FIRST  CLEAR X\n"
      "       LDA   #5\n"
      "       LDX   #0\n"
      "       LDA   VALUE\n"
      "       ADD   VALUE,X\n"
      "       +JSUB SUBRTN\n"
      "       STA   RESULT\n"
      "       RSUB\n"
      "VALUE  WORD  42\n"
      "RESULT RESW  1\n"
      "SUBRTN RSUB\n"
      "       END   FIRST\n";
  sicxe::Assembler a;
  try {
    CodeMemory m = a.assemble(src);
    std::fputs(a.lastInfo().listing.c_str(), stdout);
    for (auto& [addr, seg] : m.segments()) std::printf("segment @%zu, %zu bytes\n", addr, seg.size());
    std::printf("entry=%zu length=%zu relocations=%zu\n", a.lastInfo().entryPoint, a.lastInfo().length, a.lastInfo().relocations.size());
  } catch (const sicxe::AssemblyError& e) { std::fputs(e.what(), stderr); return 1; }
}
