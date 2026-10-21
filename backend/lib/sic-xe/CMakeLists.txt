get_filename_component(LIB_NAME
    ${CMAKE_CURRENT_SOURCE_DIR}
    NAME
)

file(GLOB_RECURSE SOURCES
    CONFIGURE_DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp"
)

set(ASSEMBLER_SOURCES
    "${CMAKE_CURRENT_SOURCE_DIR}/src/Assembler/assembler.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/Assembler/expression.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/Assembler/isa.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/Assembler/parser.cpp"
)

list(FILTER SOURCES EXCLUDE REGEX "/src/Assembler/.*\\.cpp$")

add_library(sicxe_assembler STATIC ${ASSEMBLER_SOURCES})
set_target_properties(sicxe_assembler PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_include_directories(sicxe_assembler PUBLIC
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

add_library(${LIB_NAME} SHARED
    ${SOURCES}
    ${SHARED_SOURCES}
)

target_include_directories(${LIB_NAME}
    PUBLIC
        ${CMAKE_SOURCE_DIR}/include
        ${CMAKE_CURRENT_SOURCE_DIR}/include
)

if(ENABLE_ASAN)
    target_compile_options(${LIB_NAME} PRIVATE
        -fsanitize=address
        -fno-omit-frame-pointer
    )

    target_link_options(${LIB_NAME} PRIVATE
        -fsanitize=address
    )
endif()

target_link_libraries(${LIB_NAME}
    PRIVATE
        sicxe_assembler
        nlohmann_json::nlohmann_json
)

configure_architecture(${LIB_NAME})

if(BUILD_TESTING)
    enable_testing()

    file(GLOB_RECURSE TEST_SOURCES
        CONFIGURE_DEPENDS
        "${CMAKE_CURRENT_SOURCE_DIR}/test/*.cpp"
    )

    list(FILTER TEST_SOURCES EXCLUDE REGEX "/demo\\.cpp$")

    message(STATUS
        "${LIB_NAME}: found ${TEST_SOURCES}"
    )

    if(TEST_SOURCES)
        set(TEST_TARGET "${LIB_NAME}_tests")

        # Compile the assembler into the test runner. Its implementation is
        # part of the architecture DLL too, but it is not exported as DLL API.
        add_executable(${TEST_TARGET}
            ${TEST_SOURCES}
        )

        target_link_libraries(${TEST_TARGET}
            PRIVATE ${LIB_NAME} sicxe_assembler
        )

        function(add_sicxe_test CASE_NAME DESCRIPTION)
            add_test(
                NAME "sicxe.${DESCRIPTION}"
                COMMAND ${TEST_TARGET} "${CASE_NAME}"
            )
        endfunction()

        add_sicxe_test(code_memory_is_sparse_and_merges "code-memory.sparse-segment-merging")
        add_sicxe_test(spec_example_style_program "assembly.example-program-encoding")
        add_sicxe_test(formats_1_and_2 "instructions.format-1-and-format-2-encoding")
        add_sicxe_test(all_format1_opcodes_match_the_sicxe_instruction_table "instructions.all-format-1-opcodes")
        add_sicxe_test(all_format2_operand_schemas_encode_registers_and_counts "instructions.all-format-2-operands")
        add_sicxe_test(all_memory_instruction_opcodes_match_the_sicxe_instruction_table "instructions.all-memory-opcodes")
        add_sicxe_test(simulator_halt_extension "instructions.halt-extension-encoding")
        add_sicxe_test(base_relative_and_direct "addressing.base-relative-and-direct")
        add_sicxe_test(pc_relative_boundaries "addressing.pc-relative-boundaries")
        add_sicxe_test(format4_and_immediate "addressing.format-4-and-immediate-values")
        add_sicxe_test(indirect_and_indexed_rules "addressing.indirect-and-indexed-rules")
        add_sicxe_test(data_directives_and_expressions "directives.data-and-expression-encoding")
        add_sicxe_test(case_insensitive_ok "parser.case-insensitive-source")
        add_sicxe_test(org_creates_second_segment "directives.org-sparse-memory-segments")
        add_sicxe_test(start_end_and_reservations_produce_loadable_sparse_image "image.start-entry-and-reserved-gaps")
        add_sicxe_test(sic_mode "modes.sic-compatibility")
        add_sicxe_test(diagnostics_reject_invalid_mnemonics_and_operands "diagnostics.mnemonics-and-operands")
        add_sicxe_test(diagnostics_validate_registers_and_format_rules "diagnostics.registers-and-formats")
        add_sicxe_test(diagnostics_report_symbol_and_directive_errors "diagnostics.symbols-and-directives")
        add_sicxe_test(errors_throw_and_carry_diagnostics "diagnostics.exception-details")
        add_sicxe_test(entry_listing_and_warnings "metadata.entry-point-listing-and-warnings")
    endif()
endif()
