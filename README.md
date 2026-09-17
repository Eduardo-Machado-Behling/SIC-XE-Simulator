# SIC/XE Simulator

Web-based SIC/XE simulator with a **C++ backend** and **Next.js frontend**.

## Requirements

### Backend

* C++ compiler with C++20 support
* CMake >= 3.20
* Git
* Docker (optional)

### Frontend

* Node.js
* npm

The backend dependencies are downloaded automatically by CMake using `FetchContent`.

---

## Dependencies

### Backend

| Dependency                                            | Version | Purpose               |
| ----------------------------------------------------- | ------: | --------------------- |
| C++                                                   |   C++20 | Simulator and API     |
| CMake                                                 | >= 3.20 | Build system          |
| [cpp-httplib](https://github.com/yhirose/cpp-httplib) |  0.50.0 | HTTP/WebSocket server |
| [nlohmann/json](https://github.com/nlohmann/json)     |  3.12.0 | JSON serialization    |

### Frontend

| Dependency             | Version | Purpose            |
| ---------------------- | ------: | ------------------ |
| Node.js                |       — | JavaScript runtime |
| Next.js                |  16.3.4 | Web framework      |
| React                  |  19.2.8 | UI                 |
| TypeScript             |     5.x | Type checking      |
| Monaco Editor          |  0.56.0 | Code editor        |
| @monaco-editor/react   |   4.7.0 | React integration  |
| xterm.js               |   6.0.0 | Terminal           |
| React Arborist         |  3.16.0 | File tree          |
| react-resizable-panels |  4.12.4 | Resizable UI       |
| Lucide React           |  1.46.0 | Icons              |
| cmdk                   |   1.1.1 | Command menu       |
| Tailwind CSS           |     4.x | Styling            |

---

# Project Structure

```text
sic-xe-simulator/
│
├── backend/
│   ├── CMakeLists.txt
│   ├── Dockerfile
|   ├── bin/
│   └── archs/
│   │
│   ├── include/
│   │
│   ├── src/
│   │   ├── memory/
│   │   └── ...
│   │
│   └── lib/
│       └── ...
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── public/
│   ├── package.json
│   └── ...
│
│
├── package.json
└── README.md
```

---

# Backend

The backend is a C++20 application built with CMake.

## Configure

From the `backend` directory:

```bash
cmake -B build
```

## Build

```bash
cmake --build build
```

The API executable is generated in:

```text
bin/api
```

Architecture libraries are generated in:

```text
bin/archs/
```

## Build with AddressSanitizer

AddressSanitizer can be enabled with:

```bash
cmake -B build -DENABLE_ASAN=ON
cmake --build build
```

---

# Backend Dependencies

CMake automatically downloads the following dependencies:

```cmake
FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG v0.50.0
)

FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.12.0
)
```

No manual installation of these libraries is required.

A working Git installation is required for CMake to fetch them.

---

# Running the Backend

After building:

```bash
./bin/api
```

On Windows:

```powershell
.\bin\api.exe
```

The API listens on:

```text
http://localhost:8080
```

The WebSocket endpoint is:

```text
ws://localhost:8080/ws
```

---

# Frontend

The frontend is a Next.js application.

## Install Dependencies

```bash
cd frontend
npm install
```

## Development

```bash
npm run dev
```

The development server is started by Next.js.

## Production Build

```bash
npm run build
```

## Production Server

```bash
npm run start
```

## Lint

```bash
npm run lint
```

---

# Running Both Applications

Start the backend:

```bash
cd backend
cmake -B build
cmake --build build
./../bin/api
```

In a second terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend communicates with the backend through the API/WebSocket interface.

---

# Docker

Docker can be used to build and run the backend.

From the repository root:

```bash
docker build \
    -f backend/Dockerfile.vercel \
    -t cpu-simulator-backend \
    backend
```

Run:

```bash
docker run --rm \
    -p 8080:8080 \
    cpu-simulator-backend
```

The backend will be available at:

```text
http://localhost:8080
```

and:

```text
ws://localhost:8080/ws
```

---

# npm Scripts

The repository root provides convenience scripts.

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `npm run frontend` | Start the frontend development server    |
| `npm run backend`  | Build and run the backend using Docker   |
| `npm run dev`      | Start the Vercel development environment |
| `npm run build`    | Build command handled by Vercel          |

### Frontend Scripts

Run from `frontend/`:

| Command         | Description                      |
| --------------- | -------------------------------- |
| `npm run dev`   | Start Next.js development server |
| `npm run build` | Create production build          |
| `npm run start` | Start production server          |
| `npm run lint`  | Run ESLint                       |

---

# Architecture Libraries

Architecture implementations are located under:

```text
backend/lib/
```

The main CMake configuration automatically discovers directories containing a `CMakeLists.txt`.

For example:

```text
backend/
└── lib/
    └── sic-xe/
        ├── CMakeLists.txt
        ├── include/
        └── src/
```

Architecture targets are output to:

```text
bin/archs/
```

---

# Configuration

The backend currently configures `cpp-httplib` without optional external compression or OpenSSL dependencies:

```text
HTTPLIB_REQUIRE_OPENSSL = OFF
HTTPLIB_REQUIRE_ZLIB    = OFF
HTTPLIB_REQUIRE_BROTLI  = OFF
HTTPLIB_REQUIRE_ZSTD    = OFF
```

The non-blocking `getaddrinfo` implementation is also disabled for compatibility with MinGW:

```text
HTTPLIB_USE_NON_BLOCKING_GETADDRINFO = OFF
```

---

# Clean Build

To remove the CMake build directory:

### Linux / macOS

```bash
rm -rf backend/build
```

### Windows PowerShell

```powershell
Remove-Item -Recurse -Force backend/build
```

Then configure and build again:

```bash
cd backend
cmake -B build
cmake --build build
```

---

# Development Stack

```text
Frontend
├── Next.js
├── React
├── TypeScript
├── Tailwind CSS
├── Monaco Editor
└── xterm.js

Backend
├── C++20
├── CMake
├── cpp-httplib
└── nlohmann/json

Communication
├── HTTP
└── WebSocket

Deployment
├── Docker
└── Vercel
```

---

# Status

Work in progress.
