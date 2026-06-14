#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys

from .server import export_training_data


def main() -> int:
    parser = argparse.ArgumentParser(description="My Agent backend tools")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("training-export", help="Export approved knowledge as training JSONL")
    args = parser.parse_args()

    if args.command == "training-export":
        result = export_training_data()
        print(f"Exported {result['recordCount']} approved training records to {result['outputPath']}.")
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
