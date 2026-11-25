// The simulator command that links `files` and loads them at `loadAddress`:
// `load [@<hex>] %<path> [%<path> ...]`. Address 0 is left out, which is the
// single-file `load %<path>` the simulator always accepted.
export function loadCommand(files: string[], loadAddress: number): string {
    const address = loadAddress === 0 ? "" : `@${loadAddress.toString(16).toUpperCase()} `;
    return `load ${address}${files.map((file) => `%${file}`).join(" ")}`;
}
