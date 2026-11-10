#pragma once
#include <algorithm>
#include <functional>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "assembler/diagnostics.hpp"

namespace sicxe {

// The file the macro processor's output is reported and assembled as, at the project root.
inline constexpr std::string_view kMacroOutputFile = "MASMAPRG.ASM";

enum class LineKind { Verbatim, Call, Label, Expanded };

// serial 0 = none; output/source are 1-based.
struct LineOrigin {
  int output = 0;
  int source = 0;
  LineKind kind = LineKind::Verbatim;
  int serial = 0;
};

struct Formal {
  std::string name;
  std::optional<std::string> defaultValue;
};

struct MacroDefinition {
  int index = 0;
  std::string name;
  std::string prototype;
  std::string labelFormal;  // "" = none
  std::vector<Formal> formals;
  bool active = true;
  int originSourceLine = 0;  // >0 if defined in the source
  int originSerial = 0;      // >0 if created by an expansion
  bool hasNested = false;    // contains MCDEFN in its body (selects #(d,i) display)
  std::vector<std::string> displayBody;  // prototype first, MCEND last, display form
  std::vector<int> bodySourceLines;      // same length as displayBody; 0 when not from source
};

struct MacroName {
  std::string name;
  int definition = 0;
  int line = 0;
};

struct Actual {
  int index = 0;
  std::string formal;
  std::string value;
};

struct Expansion {
  int serial = 0;
  std::string macro;
  int definition = 0;
  int parent = 0;  // parent serial, 0 = top level
  int depth = 0;
  int callLine = 0;
  std::string callText;
  std::vector<Actual> actuals;
  int outputFrom = 0;  // inclusive, 1-based MASMAPRG.ASM lines
  int outputTo = 0;
};

enum class TraceAction {
  Copy,
  DefineStart,
  Prototype,
  Store,
  DefineEnd,
  Call,
  ReadPrototype,
  ExpansionEnd,
  Error
};

// One line read (spec 4.4, Figure 4.12). The empty segment after a final newline is not a line.
struct TraceStep {
  int step = 0;
  bool fromExpansion = false;
  int line = 0;    // source line, or body line in the expansion's definition (1 = prototype)
  int serial = 0;  // expansion read from, 0 if source
  int d = 0;       // definition level before the line
  bool e = false;  // expansion stack not empty
  int depth = 0;   // expansion stack depth, 0 for a source line
  std::string text;  // source line without '\r', or the expansion line after substitution
  TraceAction action = TraceAction::Copy;
  // Copy -> targetOutput; Store, Prototype, DefineEnd -> targetDefinition (index) and
  // targetBodyLine; Call -> targetSerial. 0 = n/a, but targetDefinition counts only
  // when targetBodyLine > 0 (a definition never entered in the tables has neither).
  // Error steps have no target.
  int targetOutput = 0;
  int targetDefinition = 0;
  int targetBodyLine = 0;
  int targetSerial = 0;
};

struct MacroTrace {
  std::vector<TraceStep> steps;
  bool truncated = false;
};

struct MacroProcessorOptions {
  // Default (empty): findInstruction(upper) || findDirective(upper).
  std::function<bool(std::string_view upper)> isOperation;
  int maxDepth = 64;
  int maxExpansions = 2000;
  int maxOutputLines = 20000;
  // Bytes of generated text: the whole output when an expansion emits a line, each actual
  // once bound, and all the lines expansions read. 1 MiB, the language server's document limit.
  int maxOutputBytes = 1048576;
  int maxTraceSteps = 5000;
};

struct MacroResult {
  std::string text;
  std::vector<LineOrigin> lineMap;
  std::vector<Diagnostic> diagnostics;
  std::vector<MacroName> names;
  std::vector<MacroDefinition> definitions;
  std::vector<Expansion> expansions;
  MacroTrace trace;
  bool hasMacros = false;

  bool ok() const {
    return std::none_of(diagnostics.begin(), diagnostics.end(),
                        [](const Diagnostic& d) { return d.severity == Severity::Error; });
  }
};

class MacroProcessor {
 public:
  explicit MacroProcessor(MacroProcessorOptions options = {});
  MacroResult process(std::string_view source) const;  // never throws for source problems

 private:
  MacroProcessorOptions options_;
};

// A range of the source (1-based). synthetic: it came from an expansion and is the
// macro name on the outermost call line, not the text that produced the position.
struct SourceSpan {
  int line = 0;
  int column = 0;
  int length = 0;
  bool synthetic = false;
};

// Maps a position of r.text (MASMAPRG.ASM) to `source`, the text r was processed from:
// a verbatim line keeps its column and length; an expansion line maps to the macro name
// of the outermost call (synthetic).
SourceSpan mapToSource(const MacroResult& r, std::string_view source, int outputLine, int outputColumn,
                       int length);

// Assembler diagnostics of r.text moved to `source` (spec 5). A diagnostic on an expansion
// line gets the prefix "In expansion of NAME (#001, MASMAPRG.ASM:12): ", naming the
// innermost expansion and the MASMAPRG.ASM line. "(first defined on line N)" is rewritten
// to the source line. The message "Missing END directive" is never changed; only its
// position moves.
std::vector<Diagnostic> remapAssemblyDiagnostics(const MacroResult& r, std::string_view source,
                                                 const std::vector<Diagnostic>& assembled);

}  // namespace sicxe
