#!/bin/bash
set -e

DB_PATH="/home/jeogo/.config/focusq/queue-data"

if [ -d "$DB_PATH" ]; then
  echo "Deleting DB directory: $DB_PATH"
  rm -rf "$DB_PATH"
  echo "DB deleted."
else
  echo "DB directory not found: $DB_PATH"
fi
