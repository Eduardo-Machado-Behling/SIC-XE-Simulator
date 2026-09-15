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

configure_architecture(${LIB_NAME})