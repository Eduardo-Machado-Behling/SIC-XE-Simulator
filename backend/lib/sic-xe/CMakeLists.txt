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
    "${CMAKE_CURRENT_SOURCE_DIR}/src/Assembler/macro_processor.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/Assembler/macro_remap.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/Assembler/macro_text.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/Assembler/parser.cpp"
)

list(FILTER SOURCES EXCLUDE REGEX "/src/Assembler/.*\\.cpp$")

add_library(sicxe_assembler STATIC ${ASSEMBLER_SOURCES})
set_target_properties(sicxe_assembler PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_include_directories(sicxe_assembler PUBLIC
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

# Command line macro processor. It links the static assembler only.
add_executable(sicxe_macro tools/sicxe_macro.cpp)
target_link_libraries(sicxe_macro PRIVATE sicxe_assembler)
set_target_properties(sicxe_macro PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/bin")

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
    # The macro processor has its own test runner (sicxe_macro_tests).
    list(FILTER TEST_SOURCES EXCLUDE REGEX "/test_macro_processor\\.cpp$")
    # So does SICXE::load_file (sicxe_load_tests).
    list(FILTER TEST_SOURCES EXCLUDE REGEX "/test_load\\.cpp$")

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

        # Macro processor tests: own executable, linked against the static assembler only.
        add_executable(sicxe_macro_tests
            "${CMAKE_CURRENT_SOURCE_DIR}/test/test_macro_processor.cpp"
        )
        target_link_libraries(sicxe_macro_tests PRIVATE sicxe_assembler)
        # The demo program of spec section 7.
        target_compile_definitions(sicxe_macro_tests PRIVATE
            SICXE_DEMO_ASM="${CMAKE_CURRENT_SOURCE_DIR}/test/data/macro_demo.asm"
        )

        function(add_sicxe_macro_test CASE_NAME DESCRIPTION)
            add_test(
                NAME "sicxe.macro.${DESCRIPTION}"
                COMMAND sicxe_macro_tests "${CASE_NAME}"
            )
        endfunction()

        add_sicxe_macro_test(identity_for_source_without_macros "identity.source-without-macros")
        add_sicxe_macro_test(identity_preserves_crlf "identity.preserves-crlf")
        add_sicxe_macro_test(exercise1_definition_table "definition.exercise-1-table")
        add_sicxe_macro_test(figure_4_10_nested_formals "definition.figure-4-10-nested-formals")
        add_sicxe_macro_test(prototype_shapes "definition.prototype-shapes")
        add_sicxe_macro_test(literal_immediate_in_body_is_not_a_parameter "definition.literal-immediate-is-not-a-parameter")
        add_sicxe_macro_test(body_markers_skip_quotes_comments_and_registers "definition.body-markers")
        add_sicxe_macro_test(nested_prototype_substitutes_outer_formals "definition.nested-prototype-outer-formals")
        add_sicxe_macro_test(lowercase_keywords "definition.lowercase-keywords")
        add_sicxe_macro_test(redefinition_keeps_old_inactive "definition.redefinition-keeps-old-inactive")
        add_sicxe_macro_test(definitions_are_removed_from_output "definition.removed-from-output")
        add_sicxe_macro_test(definition_errors "definition.errors")
        add_sicxe_macro_test(exercise1_seventeenth_expansion "expansion.exercise-1-seventeenth")
        add_sicxe_macro_test(keyword_defaults_and_dot_marker "expansion.keyword-defaults-and-dot-marker")
        add_sicxe_macro_test(mixed_positional_and_keyword "expansion.mixed-positional-and-keyword")
        add_sicxe_macro_test(empty_actual "expansion.empty-actual")
        add_sicxe_macro_test(label_without_label_formal_becomes_equ "expansion.label-becomes-equ")
        add_sicxe_macro_test(quotes_comments_and_registers_untouched "expansion.quotes-comments-registers-untouched")
        add_sicxe_macro_test(literal_immediate_survives_expansion "expansion.literal-immediate-survives")
        add_sicxe_macro_test(case_insensitive_call "expansion.case-insensitive-call")
        add_sicxe_macro_test(crlf_expansion "expansion.crlf")
        add_sicxe_macro_test(call_errors "expansion.call-errors")
        add_sicxe_macro_test(line_map_kinds "expansion.line-map-kinds")
        add_sicxe_macro_test(comments_and_blank_lines_in_body "expansion.comments-and-blank-lines")
        add_sicxe_macro_test(exercise2_nested_definition_keywords "nested.exercise-2-keywords")
        add_sicxe_macro_test(figure_4_12_outputs "nested.figure-4-12-outputs")
        add_sicxe_macro_test(figure_4_10_three_level_expansion "nested.figure-4-10-three-levels")
        add_sicxe_macro_test(scale_defines_multsc_and_divsc "nested.scale-defines-multsc-divsc")
        add_sicxe_macro_test(discr_nested_calls "nested.discr-calls")
        add_sicxe_macro_test(serial_in_nested_expansions "nested.serial")
        add_sicxe_macro_test(redefinition_inside_expansion "nested.redefinition")
        add_sicxe_macro_test(nested_crlf "nested.crlf")
        add_sicxe_macro_test(reparsed_prototype_closed_quote "nested.reparsed-prototype-closed-quote")
        add_sicxe_macro_test(reparsed_prototype_half_typed_quote "nested.reparsed-prototype-half-typed-quote")
        add_sicxe_macro_test(reparsed_prototype_half_typed_quote_one_argument "nested.reparsed-prototype-half-typed-quote-one-argument")
        add_sicxe_macro_test(reparsed_prototype_equals_actual "nested.reparsed-prototype-equals-actual")
        add_sicxe_macro_test(reparsed_prototype_lost_label "nested.reparsed-prototype-lost-label")
        add_sicxe_macro_test(reparsed_prototype_mcdefn_actual "nested.reparsed-prototype-mcdefn-actual")
        add_sicxe_macro_test(recursion_limit "limits.recursion")
        add_sicxe_macro_test(expansion_limit "limits.expansions")
        add_sicxe_macro_test(output_limit "limits.output")
        add_sicxe_macro_test(byte_limit_doubling_recursion "limits.bytes-doubling-recursion")
        add_sicxe_macro_test(byte_limit_total_output "limits.bytes-total-output")
        add_sicxe_macro_test(byte_limit_long_actual "limits.bytes-long-actual")
        add_sicxe_macro_test(byte_limit_lines_stored_in_a_definition "limits.bytes-lines-stored-in-a-definition")
        add_sicxe_macro_test(byte_limit_spares_legal_programs "limits.bytes-spare-legal-programs")
        add_sicxe_macro_test(figure_4_12_trace "trace.figure-4-12")
        add_sicxe_macro_test(scale_level_sequence "trace.scale-level-sequence")
        add_sicxe_macro_test(trace_truncation "trace.truncation")
        add_sicxe_macro_test(trace_error_steps "trace.errors")
        add_sicxe_macro_test(trace_comment_before_prototype "trace.comment-before-prototype")
        add_sicxe_macro_test(trace_unclosed_definition_loses_targets "trace.unclosed-definition")
        add_sicxe_macro_test(trace_crlf_text "trace.crlf")
        add_sicxe_macro_test(assembler_error_in_expansion_maps_to_call "remap.error-in-expansion-maps-to-call")
        add_sicxe_macro_test(verbatim_error_keeps_column "remap.verbatim-error-keeps-column")
        add_sicxe_macro_test(remapped_message_line_numbers "remap.message-line-numbers")
        add_sicxe_macro_test(remapped_diagnostic_on_a_call_label_line "remap.call-label-line")
        add_sicxe_macro_test(remap_passes_through_lines_outside_the_output "remap.outside-output-passes-through")
        add_sicxe_macro_test(demo_program_expands_and_assembles "demo.expands-and-assembles")

        # Smoke test of the sicxe_macro command line tool.
        add_test(
            NAME sicxe.macro.cli-smoke
            COMMAND ${CMAKE_COMMAND}
                -DCLI=$<TARGET_FILE:sicxe_macro>
                -DDEMO=${CMAKE_CURRENT_SOURCE_DIR}/test/data/macro_demo.asm
                -DWORK=${CMAKE_CURRENT_BINARY_DIR}/cli-smoke
                -P ${CMAKE_CURRENT_SOURCE_DIR}/tools/cli_smoke.cmake
        )

        # SICXE::load_file tests. They compile the architecture's sources instead of
        # linking the DLL, which exports only create_arch/destroy_arch on Windows.
        set(LOAD_TEST_SOURCES ${SOURCES})
        list(FILTER LOAD_TEST_SOURCES EXCLUDE REGEX "/src/main\\.cpp$")
        add_executable(sicxe_load_tests
            "${CMAKE_CURRENT_SOURCE_DIR}/test/test_load.cpp"
            ${LOAD_TEST_SOURCES}
            ${SHARED_SOURCES}
        )
        target_link_libraries(sicxe_load_tests PRIVATE sicxe_assembler nlohmann_json::nlohmann_json)

        function(add_sicxe_load_test CASE_NAME DESCRIPTION)
            add_test(
                NAME "sicxe.load.${DESCRIPTION}"
                COMMAND sicxe_load_tests "${CASE_NAME}"
            )
        endfunction()

        add_sicxe_load_test(latin1_comment_still_reports_macros "latin1-comment-still-reports-macros")
        add_sicxe_load_test(macro_report_replaces_invalid_utf8 "macro-report-replaces-invalid-utf8")

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
