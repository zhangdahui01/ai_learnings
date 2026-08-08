#!/usr/bin/env bash
# Install optional semantic graph engines locally. Requires a network connection.
set -euo pipefail
usage(){ echo "Usage: bash scripts/install_advanced_tools.sh [--all|--jqassistant|--joern|--codeql] [--yes]"; }
if [ "${BASH_VERSINFO[0]}" -lt 4 ]; then
  if [ "$(uname -s)" = Darwin ] && [ -x /opt/homebrew/bin/brew ]; then
    echo "Installing modern Bash required by SDKMAN..."
    /opt/homebrew/bin/brew install bash
    exec /opt/homebrew/bin/bash "$0" "$@"
  fi
  echo "Bash 4+ is required for advanced-tool installation." >&2; exit 1
fi
tools=(); assume_yes=false
for arg in "$@"; do case "$arg" in --all) tools=(jqassistant joern codeql);; --jqassistant) tools+=(jqassistant);; --joern) tools+=(joern);; --codeql) tools+=(codeql);; --yes) assume_yes=true;; -h|--help) usage; exit 0;; *) echo "Unknown option: $arg" >&2; usage >&2; exit 2;; esac; done
[ "${#tools[@]}" -gt 0 ] || { usage >&2; exit 2; }
if [ "$assume_yes" = false ]; then
  printf 'This downloads optional analyzers (JDK 17/19, jQAssistant, Joern, CodeQL) to your user account. Continue? [y/N] '
  read -r answer; case "$answer" in y|Y|yes|YES) ;; *) echo "Cancelled."; exit 0;; esac
fi
platform=$(uname -s); machine=$(uname -m); local_bin="$HOME/.local/bin"; local_opt="$HOME/.local/opt"; mkdir -p "$local_bin" "$local_opt"
export PATH="$local_bin:$PATH"
if ! command -v curl >/dev/null 2>&1; then echo "curl is required." >&2; exit 1; fi
if [ "$platform" = Darwin ] && ! command -v brew >/dev/null 2>&1; then echo "Install core first: bash scripts/bootstrap.sh --install-core" >&2; exit 1; fi
for tool in "${tools[@]}"; do
  case "$tool" in
    jqassistant)
      if [ "$platform" = Darwin ]; then brew install openjdk@17; fi
      if [ ! -s "$HOME/.sdkman/bin/sdkman-init.sh" ]; then
        # SDKMAN may fail only while editing a shell profile in sandboxed environments;
        # its installation files are still usable when the initializer exists afterwards.
        curl -s "https://get.sdkman.io" | bash || true
      fi
      [ -s "$HOME/.sdkman/bin/sdkman-init.sh" ] || { echo "SDKMAN installation did not create its initializer." >&2; exit 1; }
      # SDKMAN's own initializer references optional unset variables.
      # shellcheck disable=SC1090
      set +u; source "$HOME/.sdkman/bin/sdkman-init.sh"; sdk install jqassistant; set -u
      ;;
    joern)
      if [ "$platform" = Darwin ]; then brew install openjdk@19 coreutils; fi
      installer="$local_opt/joern-install.sh"; curl -fL "https://github.com/joernio/joern/releases/latest/download/joern-install.sh" -o "$installer"; chmod u+x "$installer"
      echo "Starting the official Joern installer. Accept its prompts to complete installation."
      "$installer" --interactive
      ;;
    codeql)
      case "$platform" in Darwin) asset=codeql-bundle-osx64.tar.gz;; Linux) asset=codeql-bundle-linux64.tar.gz;; *) echo "CodeQL automatic install supports macOS/Linux only." >&2; continue;; esac
      [ "$platform" != Darwin ] || { [ "$machine" != arm64 ] || echo "Note: CodeQL on Apple Silicon may require Rosetta 2 and Xcode command-line tools."; }
      archive="$local_opt/$asset"; curl -fL "https://github.com/github/codeql-action/releases/latest/download/$asset" -o "$archive"
      rm -rf "$local_opt/codeql"; mkdir -p "$local_opt/codeql"; tar -xzf "$archive" -C "$local_opt/codeql" --strip-components=1
      codeql_bin=$(find "$local_opt/codeql" -type f -name codeql -perm -u+x | head -n 1)
      [ -n "$codeql_bin" ] || { echo "Could not locate CodeQL executable after extraction." >&2; exit 1; }
      ln -sf "$codeql_bin" "$local_bin/codeql"; "$local_bin/codeql" version
      ;;
  esac
done
echo "Advanced tools installed. Open a new terminal, or run: export PATH=\"$HOME/.local/bin:\$PATH\""
