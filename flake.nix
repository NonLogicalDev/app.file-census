{
  description = "file-census development shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          linuxTauriDeps = pkgs.lib.optionals pkgs.stdenv.isLinux [
            pkgs.atk
            pkgs.cairo
            pkgs.gdk-pixbuf
            pkgs.glib
            pkgs.glib-networking
            pkgs.gtk3
            pkgs.libsoup_3
            pkgs.pango
            pkgs.webkitgtk_4_1
          ];
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.cargo
              pkgs.clippy
              pkgs.git
              pkgs.just
              pkgs.nodejs_22
              pkgs.pkg-config
              pkgs.rustc
              pkgs.rustfmt
            ] ++ linuxTauriDeps;

            shellHook = ''
              export FILE_CENSUS_DEV_SHELL=1
            '';
          };
        });
    };
}
