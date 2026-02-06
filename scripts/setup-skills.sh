#!/bin/bash
# Install AI agent skills for this project.
# Run once after cloning: ./scripts/setup-skills.sh
# Skills are gitignored — this script is the source of truth.

set -e

echo "Installing agent skills for Stik..."
echo ""

# React + Web (Vercel)
npx skills add vercel-labs/agent-skills -y

# Development workflow (obra/superpowers)
npx skills add obra/superpowers -y

# TypeScript, async patterns, and 143 more (wshobson)
npx skills add wshobson/agents -y

# Rust — 179 rules across 14 categories
npx skills add leonardomso/rust-skills -y

echo ""
echo "Done! All skills installed."
