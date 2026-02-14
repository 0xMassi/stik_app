fn main() {
    prost_build::compile_protos(&["proto/apple_notes.proto"], &["proto/"]).unwrap();
    tauri_build::build();
}
