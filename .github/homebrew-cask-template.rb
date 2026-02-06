# Homebrew Cask Template for Stik
#
# Setup instructions:
#   1. Create a new repo: github.com/0xMassi/homebrew-stik
#   2. Place this file at: Casks/stik.rb
#   3. After each release, update `version` and `sha256`
#   4. Users install with: brew install --cask 0xMassi/stik/stik
#
# To calculate SHA256 after a release:
#   shasum -a 256 Stik_<version>_aarch64.dmg
#   shasum -a 256 Stik_<version>_x64.dmg

cask "stik" do
  arch arm: "aarch64", intel: "x64"

  version "0.3.0"
  sha256 arm:   "REPLACE_WITH_ARM64_SHA256",
         intel: "REPLACE_WITH_X64_SHA256"

  url "https://github.com/0xMassi/stik_app/releases/download/v#{version}/Stik_#{version}_#{arch}.dmg"
  name "Stik"
  desc "Instant thought capture - one shortcut, post-it appears, type, close"
  homepage "https://github.com/0xMassi/stik_app"

  depends_on macos: ">= :catalina"

  app "Stik.app"

  zap trash: [
    "~/Documents/Stik",
    "~/.stik",
    "~/Library/Caches/com.stik.app",
    "~/Library/WebKit/com.stik.app",
  ]
end
