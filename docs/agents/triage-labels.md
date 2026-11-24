# Triage labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning |
| :--- | :--- | :--- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | `needs-info` | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent` | Fully specified, ready for an agent to pick up |
| `ready-for-human` | `ready-for-human` | Requires human implementation or judgement |
| `wontfix` | `wontfix` | Will not be actioned |

For local markdown, the label is written on the ticket's `Status:` line. When a skill mentions a role (for example, "apply the AFK-ready label"), use the corresponding string from this table.

Implementation tickets created by `/to-tickets` start as `ready-for-agent`. They are not triage queue items; do not re-triage them.
