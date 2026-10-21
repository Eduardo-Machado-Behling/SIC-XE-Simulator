get_filename_component(LIB_NAME
    ${CMAKE_CURRENT_SOURCE_DIR}
    NAME
)

file(GLOB_RECURSE SOURCES
    CONFIGURE_DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp"
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
        nlohmann_json::nlohmann_json
)

configure_architecture(${LIB_NAME})

if(BUILD_TESTING)
    enable_testing()

    file(GLOB_RECURSE TEST_SOURCES
        CONFIGURE_DEPENDS
        "${CMAKE_CURRENT_SOURCE_DIR}/test/*.cpp"
    )

    # demo.cpp is a standalone example with its own main(), not a test case.
    list(FILTER TEST_SOURCES EXCLUDE REGEX "/demo\\.cpp$")

    set(ASSEMBLER_SOURCES
        "${CMAKE_CURRENT_SOURCE_DIR}/src/Assembler/assembler.cpp"
        "${CMAKE_CURRENT_SOURCE_DIR}/src/Assembler/expression.cpp"
        "${CMAKE_CURRENT_SOURCE_DIR}/src/Assembler/isa.cpp"
        "${CMAKE_CURRENT_SOURCE_DIR}/src/Assembler/parser.cpp"
    )

    message(STATUS
        "${LIB_NAME}: found ${TEST_SOURCES}"
    )

    if(TEST_SOURCES)
        set(TEST_TARGET "${LIB_NAME}_tests")

        # Compile the assembler into the test runner. Its implementation is
        # part of the architecture DLL too, but it is not exported as DLL API.
        add_executable(${TEST_TARGET}
            ${TEST_SOURCES}
            ${ASSEMBLER_SOURCES}
        )

        target_link_libraries(${TEST_TARGET}
            PRIVATE ${LIB_NAME}
        )

        add_test(
            NAME ${TEST_TARGET}
            COMMAND ${TEST_TARGET}
        )
    endif()
endif()
