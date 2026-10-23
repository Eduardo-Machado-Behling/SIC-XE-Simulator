# SIC/XE Simulator

Web-based SIC/XE simulator with a **C++ backend** and **Next.js frontend**.

## Collaborators
- Eduardo Machado Behling
- Pedro da Silva D'Ávila
- Diogo Avila Fraga
- Henrique Osorio Brayer

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

Environment variables read by `bin/api`:

| Variable              | Default     | Purpose                                                                 |
| --------------------- | ----------- | ----------------------------------------------------------------------- |
| `PORT`                | `8080`      | Listening port                                                          |
| `HOST`                | `0.0.0.0`   | Listening address                                                       |
| `MAX_BODY_BYTES`      | `8388608`   | Request body limit; larger bodies get `413`                             |
| `MAX_SESSION_BYTES`   | `16777216`  | Storage budget of one session; writes that would exceed it get `413`    |
| `MAX_TOTAL_BYTES`     | `268435456` | Storage budget of all sessions; least recently used ones are evicted    |
| `MAX_SESSIONS`        | `10000`     | Number of sessions; creating one more evicts the least recently used    |
| `SESSION_TTL_SECONDS` | `86400`     | Idle time after which a session expires (`0` = never)                   |

Session storage sizes are estimates: the stored text plus a fixed overhead
per session (256 bytes), project (256 bytes) and file (64 bytes), so many
empty projects or files count too. An evicted or expired session answers
`404 session-not-found`, and clients recover as after a restart: create a new
session and re-sync. These limits keep memory bounded on a small instance,
since `POST /sessions` needs no authentication.

`bin/api` binds its port exclusively: it prints `Listening on <host>:<port>`
once the port is bound, and exits with code `1` if another process already
uses it (a second server must never share the port, because sessions live in
the memory of one process).

## HTTP API

The HTTP contract is [`api_spec/openapi.yaml`](api_spec/openapi.yaml)
(OpenAPI 3.1). It is the source of truth: health check, architectures,
anonymous sessions, and session-scoped projects and files. Sessions and
their projects live in memory and are lost when the server restarts; clients
recover by creating a new session and re-syncing (see the spec).

The older routes (`/heartbeat`, `/simulator/archs`, `/projects`, `/project`,
`/project/load`, `/simulator/project/file`, ...) are deprecated and kept only
until the frontend moves to the documented API. The `/ws` WebSocket protocol
is not part of the OpenAPI document.

## API tests

`backend/tests/api` holds API-level tests (Node's built-in test runner plus
Ajv and a YAML parser, isolated in their own `package.json`). They start the
real `bin/api` on a free port in `18440-18449`, call every operation in
`api_spec/openapi.yaml`, validate each response against the documented
schemas, and fail if any documented status code (other than `500`) is never
exercised. The legacy routes and `/ws` are smoke-tested too.

Requires Node.js 22 or newer and a built backend. From the repository root:

```bash
npm --prefix backend/tests/api install-ci-test
```

(`install-ci-test` is `npm ci` followed by `npm test`; once the packages are
installed, `npm --prefix backend/tests/api test` is enough.)

Optional overrides: `API_BIN` (path to the executable, default
`backend/bin/api`), `API_TEST_PORTS` (port range, default `18440-18449`) and
`OPENAPI_SPEC` (path to the spec). Several runs can share the port range:
the harness waits for its own server's `Listening on` line and moves to the
next port if another run took the one it picked.

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
