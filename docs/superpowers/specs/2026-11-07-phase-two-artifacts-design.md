# Phase 2 reference artifacts

Create reviewable examples in `taro / Nike/Brand Discovery` for the tools in the supplied Phase 2 screenshot. This pass builds presentation artifacts only; actual tool execution is a later step.

## Approach

Follow the user's revised visual direction: reuse existing terminal activity groups, context-summary dividers, compact Edited-row disclosures, and document cards. Retain Taro's Geist typography, dark surfaces, purple accent, semantic status colors, and spacing. Remove the earlier large Phase 2 designs and the duplicate Skill card. Retain the existing Agent card and original skill invocation.

## Examples

- LSP: operation, 1-based source position, symbol locations, and an unavailable-server example with recovery guidance.
- PowerShell: groupable terminal rows with command, status, duration, and expandable output.
- TaskOutput: retrieval outcome separate from task status; identify the reference's deprecation in favor of Read.
- TaskStop: stopped task identity and retained partial output.
- Plan mode: “Enter plan mode” event with exactly the Chat context summarized divider treatment.
- Design Plan and Plan: shared Design Tokens card frame, exact matching dimensions, plan name and Markdown path, Open button using the existing taskbar Markdown editor. Each plan resolves its own content; plan edits persist with its chat message.
- Worktrees: path, branch, and exit with keep/remove disposition; use a kept example.
- Skills: reuse the original invocation artifact; no new skill card.
- ToolSearch: query, deferred tool matches, and the distinction between loading a tool and invoking it.

## Constraints and verification

Identify the examples in the introductory message. Expand/collapse controls must work by keyboard. No new dependencies, native commands, provider tool registrations, or execution permissions. Migrate the retired preview messages in saved Nike sessions and add missing examples idempotently, preserving other history, converted plan content, and unrelated chats. Verify migration and Open callbacks with regression tests, run the suite and build, and inspect rendered cards at wide and narrow chat widths.
