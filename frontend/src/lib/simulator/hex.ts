// Upper-case hexadecimal, zero-padded to `digits` (wider values are kept whole).
export function hex(value: number, digits: number): string {
    return value.toString(16).toUpperCase().padStart(digits, "0");
}

// Object code as Beck prints it: two digits per byte, no separators.
export function hexBytes(bytes: number[]): string {
    return bytes.map((byte) => hex(byte, 2)).join("");
}
