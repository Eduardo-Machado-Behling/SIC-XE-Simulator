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

configure_architecture(${LIB_NAME})

# ==================================================
# Tests: every tests/*Test.cpp is its own executable
# ==================================================

if(BUILD_TESTING)
    # The DLL only exports create_arch/destroy_arch on Windows, so tests build the sources directly.
    set(TEST_LIB_SOURCES ${SOURCES})
    list(FILTER TEST_LIB_SOURCES EXCLUDE REGEX ".*/src/main\\.cpp$")

    add_library(${LIB_NAME}-testable STATIC
        ${TEST_LIB_SOURCES}
        ${SHARED_SOURCES}
    )

    target_include_directories(${LIB_NAME}-testable
        PUBLIC
            ${CMAKE_SOURCE_DIR}/include
            ${CMAKE_CURRENT_SOURCE_DIR}/include
    )

    if(ENABLE_ASAN)
        target_compile_options(${LIB_NAME}-testable PUBLIC
            -fsanitize=address
            -fno-omit-frame-pointer
        )

        target_link_options(${LIB_NAME}-testable PUBLIC
            -fsanitize=address
        )
    endif()

    file(GLOB TEST_SOURCES
        CONFIGURE_DEPENDS
        "${CMAKE_CURRENT_SOURCE_DIR}/tests/*Test.cpp"
    )

    foreach(TEST_SOURCE ${TEST_SOURCES})
        get_filename_component(TEST_NAME ${TEST_SOURCE} NAME_WE)
        set(TEST_TARGET ${LIB_NAME}-${TEST_NAME})

        add_executable(${TEST_TARGET} ${TEST_SOURCE})
        target_link_libraries(${TEST_TARGET} PRIVATE ${LIB_NAME}-testable)

        add_test(NAME ${TEST_TARGET} COMMAND ${TEST_TARGET})
    endforeach()
endif()