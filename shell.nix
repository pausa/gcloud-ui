let
  pkgs = import <nixpkgs> {};
in
pkgs.mkShell {
  buildInputs = with pkgs; [
    man
    google-cloud-sdk

    # Toolchain
    rustc
    cargo
    rustfmt
    nodejs

    # Tauri build dependencies (Linux)
    pkg-config
    openssl
    glib
    gtk3
    webkitgtk_4_1
    libsoup_3
    cairo
    pango
    gdk-pixbuf
  ];
}
