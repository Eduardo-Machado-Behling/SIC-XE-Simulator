#pragma once
// Public API of the SIC/XE two-pass assembler.

#include <cstddef>
#include <map>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include "memory/CodeMemory.hpp"
#include "assembler/diagnostics.hpp"

namespace sicxe {

// The interface requested by the project (virtual destructor added).
struct IAssembler {
  virtual ~IAssembler() = default;
  // Throws AssemblyError if the source contains errors.
  virtual CodeMemory assemble(std::string code) = 0;
};

enum class ArchMode { SicXe, Sic };

struct AssemblerOptions {
  ArchMode mode = ArchMode::SicXe;   // spec section 9: mode is explicit, never inferred
  std::size_t memoryLimit = 0;       // 0 = architecture default (1 MB XE, 32 KB SIC)
};

// Modification record: `halfBytes` hex digits starting at the high nibble of
// `address` hold a relocatable address (format-4 field = 5, WORD = 6).
struct Relocation {
  std::size_t address;
  unsigned halfBytes;
};

struct SymbolLocation {
  std::string name;
  std::int64_t value = 0;
  int line = 0;    // 1-based
  int column = 0;  // 1-based
  int length = 0;
};

struct SymbolReference {
  std::string name;
  int line = 0;    // 1-based
  int column = 0;  // 1-based
  int length = 0;
};

// One statement of the listing, in the columns of Beck's Fig. 2.6. Blank and
// comment-only lines are not statements and are not listed.
struct ListingLine {
  int line = 0;                         // 1-based source line
  std::optional<std::size_t> address;   // pass-1 location; empty for END, BASE, NOBASE
  std::vector<byte_t> bytes;            // pass-2 object code, never abbreviated
  std::string source;                   // the line as written
};

// Everything the CodeMemory alone cannot express.
struct AssemblyInfo {
  std::vector<Diagnostic> diagnostics;      // warnings and errors, ordered by line
  std::string programName;                  // label on START, if any
  std::size_t startAddress = 0;
  std::size_t length = 0;                   // highest address reached - start
  std::size_t entryPoint = 0;               // END operand, else start address
  std::vector<Relocation> relocations;
  std::map<std::string, std::int64_t> symbols;
  std::vector<SymbolLocation> symbolDefinitions;
  std::vector<SymbolReference> symbolReferences;
  std::string listing;                      // "ADDR  OBJECT  SOURCE" per statement
  std::vector<ListingLine> lines;           // the same listing, one entry per statement
};

struct AssemblyResult {
  CodeMemory memory;
  AssemblyInfo info;
  bool ok() const {
    for (const auto& d : info.diagnostics)
      if (d.severity == Severity::Error) return false;
    return true;
  }
};

class AssemblyError : public std::runtime_error {
 public:
  explicit AssemblyError(std::vector<Diagnostic> d)
      : std::runtime_error(formatDiagnostics(d)), diagnostics_(std::move(d)) {}
  const std::vector<Diagnostic>& diagnostics() const { return diagnostics_; }

 private:
  std::vector<Diagnostic> diagnostics_;
};

class Assembler final : public IAssembler {
 public:
  explicit Assembler(AssemblerOptions options = {}) : options_(options) {}

  // IAssembler: returns the memory image or throws AssemblyError.
  CodeMemory assemble(std::string code) override;

  // Non-throwing, side-effect-free variant with full metadata.
  AssemblyResult assembleDetailed(std::string_view code) const;

  // Discard metadata from the previously assembled source.
  void clear() noexcept;

  // Metadata of the most recent assemble() call (also populated on failure).
  const AssemblyInfo& lastInfo() const { return last_; }

 private:
  AssemblerOptions options_;
  AssemblyInfo last_;
};

}  // namespace sicxe
