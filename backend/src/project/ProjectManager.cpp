#include "project/ProjectManager.hpp"

#include <string_view>

namespace {

constexpr std::string_view kDefaultMainFile = R"ASM(
; SIC/XE syntax showcase. Create a project and run this file as a starter.
; Names are case-insensitive; labels start with a letter or '_' and then use letters/digits/'_'.
; Register names are reserved and cannot be used as labels.
; A dot is a full-line comment only in column 1. Semicolon starts a comment outside a literal.
; C literals may contain semicolons, which are not treated as comments.
. Full-line dot comment: this works only when '.' is in column 1.

SHOWCASE START 0                 ; A label, START directive, and decimal address.
        CLEAR $A                  ; Every register operand, including index X, needs the '$' prefix.
        CLEAR $X
        lDa #5                    ; Mnemonics are case-insensitive; '#' means immediate value.
        STA VALUE                 ; Without '#' or '@', an operand names a memory address.
        ADD $A, $S                ; ADD with two registers selects format-2 ADDR.
        ADDR $A, $S               ; The explicit suffixed spelling is still accepted.
        TIX $X                    ; TIX with a register selects format-2 TIXR.
        SHIFTL $T, 1              ; Shift count range is 1 through 16.
        SVC 0                     ; Service number range is 0 through 15.

        ADD,p 50                  ; ',p' forces PC-relative; 50 is a decimal memory address.
        LDA,p VALUE               ; Put the selector on the operation, before whitespace and operand.
        BASE TABLE                ; Automatic format 3 prefers PC, then BASE, then direct addressing.
        LDA,b TABLE               ; ',b' forces BASE-relative; BASE must be active; displacement is 0..4095.
        NOBASE                    ; Clears BASE; forced ',b' now reports an error.
        LDA @PTR                  ; '@' means indirect addressing.
        LDCH TEXT, $X             ; Indexing is a second operand '$X', only with simple addressing.
        +JSUB SUBROUTINE           ; '+' forces format 4 (20-bit target); format 4 cannot use ',p' or ',b'.
        J AFTER_CALL

SUBROUTINE RMO $A, $S             ; Two-register format-2 instruction.
        RSUB                      ; No operand; returns to the address saved by JSUB.

AFTER_CALL LDA #VALUE             ; Relocatable immediate symbols can use PC-relative encoding.
        +LDA #0x1000              ; '0x' starts hex; format 4 permits a 20-bit immediate constant.
        J FINISH
FINISH  HALT                      ; HALT is a one-byte format-1 instruction.

; Uncomment an example to see the listed assembler diagnostic:
;       CLEAR A                   ; Register operands require '$'.
;       LDA #4096                 ; Format-3 absolute immediate values are 0..4095; use +LDA for larger values.
;       LDA #VALUE, $X            ; Indexing cannot combine with immediate or indirect addressing.
;       +LDA,p VALUE              ; Relative selectors apply only to format 3.
;       LDA,p #5                  ; Relative selectors are invalid on absolute immediate constants.
;       LDA,b VALUE               ; Fails here because NOBASE is active.
; A relocatable target that falls back to direct format 3 warns because that field cannot be relocated.

VALUE WORD 1, -1, 0x123456        ; WORD emits three big-endian bytes per expression.
TABLE RESW 4                      ; RESW reserves words but emits no bytes.
PTR   WORD TABLE                  ; A relocatable WORD creates relocation metadata.
TEXT  BYTE C'SIC;XE', X'0D0A', 0, -1 ; BYTE accepts character/hex literals and 8-bit expressions.
COUNT RESB 1                      ; RESB reserves bytes but emits no bytes.
DELTA EQU (TABLE - VALUE) / 3 * 2 ; Expressions support parentheses and +, -, *, /; -1 shows unary minus.
HERE  EQU *                       ; '*' in an expression means the current location counter.

        ORG * + 0x10              ; ORG changes the location counter; one bare ORG restores its saved value.
FAR    BYTE X'AA'                 ; X literals need a non-empty, even number of hexadecimal digits.
        ORG                       ; ORG restoration is one saved location, not a nested stack.
RESTORED BYTE X'BB'

        END SHOWCASE              ; END can select the entry point and ignores later statements.
;       THIS_LINE_IS_IGNORED
)ASM";

} // namespace

ProjectManager::ProjectManager() {
    Project project;
    project.id = "0";
    project.name = "Hello";
    project.architecture = "sic-xe";
    project.files.insert({"main.asm", std::string(kDefaultMainFile)});
    addProject(project);
}
ProjectManager::ProjectView ProjectManager::listProjects() const {
    return std::views::transform(
        std::views::all(m_projects),
        ProjectValue{}
    );
}

void ProjectManager::addProject(const Project& project) {
    m_projects[project.id] = project;
    m_projects[project.id].files.try_emplace("main.asm", std::string(kDefaultMainFile));
}

void ProjectManager::removeProject(const std::string& projectId) {
    m_projects.erase(projectId);
}

Project& ProjectManager::getProject(const std::string& projectId) {
    return m_projects.at(projectId);
}
