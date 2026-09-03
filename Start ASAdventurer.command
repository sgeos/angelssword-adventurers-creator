#!/bin/sh
# Finder shim. Double-clicking a .command file opens it in Terminal, which is
# the only reason this file exists separately from bin/start.
exec "$(CDPATH= cd -- "$(dirname "$0")" && pwd)/bin/start" "$@"
