# HaloGuard Audit: Cleanup Implementation Checklist

**Document:** 05_CLEANUP_CHECKLIST.md  
**Date:** April 9, 2026  
**Status:** Ready for execution (awaiting approval)

---

## ⚠️ BEFORE YOU START

**Read These First:**
1. ✅ [01_FILES_TO_DELETE.md](01_FILES_TO_DELETE.md) - What's being deleted
2. ✅ [02_FILES_TO_KEEP.md](02_FILES_TO_KEEP.md) - Critical files
3. ✅ [03_CONSOLIDATION_PLAN.md](03_CONSOLIDATION_PLAN.md) - Consolidations
4. ✅ [04_ARCHIVE_STRUCTURE.md](04_ARCHIVE_STRUCTURE.md) - Archive organization

**Requirements:**
- ✅ Git repo in clean state (no uncommitted changes)
- ✅ All tests passing
- ✅ All builds working
- ✅ Team approval for cleanup
- ✅ 2+ hours available for full cleanup

---

## 🎯 CLEANUP PHASES

This cleanup can be done in three independent phases:
- ✅ **Phase 1:** Safety checks & backups (15 min)
- ✅ **Phase 2:** Safe deletions (20 min)
- ✅ **Phase 3:** Consolidations (optional, 2-3 hrs)

---

# PHASE 1: SAFETY CHECKS & BACKUPS

**Time:** 15 minutes  
**Risk:** 🟢 None (read-only)  
**Rollback:** N/A

---

## Step 1.1: Verify Git Status

```powershell
# Navigate to project
cd "C:\Users\email\OneDrive\Desktop\startup projejcts\project 2\haloguard"

# Verify clean git status
git status

# EXPECTED OUTPUT:
# On branch main
# nothing to commit, working tree clean
```

**If Not Clean:**
```bash
# Stash uncommitted changes
git stash save "WIP before cleanup"

# Or commit them
git add -A
git commit -m "checkpoint: work in progress before cleanup"
```

---

## Step 1.2: Verify Builds Work (Baseline)

```bash
# Test backend build
cd shared-core
npm run build

# EXPECTED: ✅ Build successful

# Test chrome extension build
cd ../chrome-extension
npm run build

# EXPECTED: ✅ Build successful

# Test type checking
npm run type-check

# EXPECTED: ✅ No type errors
```

**If Build Fails:**
- Stop cleanup
- Fix build errors first
- Document issues
- Retry when clean

---

## Step 1.3: Create Deletion Backup

```powershell
# Create backup folder
mkdir "audit/backup"

# Backup files to delete
Copy-Item "plan\ERROR_LOG.md" -Destination "audit/backup/ERROR_LOG.md.bak"
Copy-Item "plan\PHASE_1_DAILY_CHECKLIST.md" -Destination "audit/backup/PHASE_1_DAILY_CHECKLIST.md.bak"

# Also backup malformed files if we're deleting them
Copy-Item "docs\Plan" -Destination "audit/backup/Plan.bak"
Copy-Item "docs\plan2" -Destination "audit/backup/plan2.bak"

# Verify backups created
dir audit/backup

# EXPECTED: 4 .bak files
```

---

## Step 1.4: Search for All References

```bash
# Search for any code references to these files (critical!)

# ERROR_LOG.md references
grep -r "ERROR_LOG" --include="*.ts" --include="*.js" --include="*.py" --include="*.md"
# EXPECTED: No results (or only in this audit)

# PHASE_1_DAILY_CHECKLIST references
grep -r "PHASE_1_DAILY_CHECKLIST" --include="*.ts" --include="*.js" --include="*.py" --include="*.md"
# EXPECTED: No results

# docs/Plan references
grep -r "docs.Plan\|docs/Plan" --include="*.ts" --include="*.js" --include="*.py" --include="*.md"
# EXPECTED: No results

# docs/plan2 references
grep -r "docs.plan2\|docs/plan2" --include="*.ts" --include="*.js" --include="*.py" --include="*.md"
# EXPECTED: No results
```

**If References Found:**
- Document where found
- Assess if breaking
- Update those files before deletion
- Commit changes separately

---

## Step 1.5: Check Import/Require Usage

```bash
# Final verification - look for any actual imports
grep -r "require.*ERROR_LOG\|import.*ERROR_LOG" . 2>/dev/null
# EXPECTED: No results

grep -r "require.*DAILY_CHECKLIST\|import.*DAILY_CHECKLIST" . 2>/dev/null
# EXPECTED: No results

# Check CI/CD configs
cat .github/workflows/*.yml 2>/dev/null | grep -i "error_log\|daily_checklist"
# EXPECTED: No results (or no workflows yet)
```

---

## Step 1.6: Document Files Before Deletion

```bash
# Create audit trail showing what was deleted

# Record file sizes and contents for recovery if needed
ls -lh plan/ERROR_LOG.md plan/PHASE_1_DAILY_CHECKLIST.md

# Expected:
# -rw-r--r-- 1 user 14K Apr  9 00:54 plan/ERROR_LOG.md
# -rw-r--r-- 1 user 15K Apr  9 00:55 plan/PHASE_1_DAILY_CHECKLIST.md
```

---

## ✅ PHASE 1 VERIFICATION CHECKLIST

- [ ] Git status is clean
- [ ] Backend builds successfully
- [ ] Chrome extension builds successfully
- [ ] Type checking passes
- [ ] Backups created in audit/backup/
- [ ] No code references found to deleted files
- [ ] No CI/CD references found
- [ ] File sizes documented

**If all checks pass:** Proceed to Phase 2

---

---

# PHASE 2: SAFE DELETIONS

**Time:** 20 minutes  
**Risk:** 🟢 Very Low (git can recover)  
**Rollback:** Possible via git revert

---

## Step 2.1: Pre-Deletion Commit

```bash
# Commit backups before deletion
git add audit/backup/
git commit -m "backup: create files before cleanup deletion

- Backup plan/ERROR_LOG.md
- Backup plan/PHASE_1_DAILY_CHECKLIST.md
- Backup docs/Plan
- Backup docs/plan2

These backups allow recovery if deletion causes issues."
```

---

## Step 2.2: Delete Files - Option A (Safe)

```bash
# If you trust the safety checks, use git to delete
# (This keeps history)

git rm plan/ERROR_LOG.md
git rm plan/PHASE_1_DAILY_CHECKLIST.md
git rm docs/Plan
git rm docs/plan2

# Verify deletions staged
git status

# EXPECTED:
# On branch main
# Changes to be committed:
#   deleted:    plan/ERROR_LOG.md
#   deleted:    plan/PHASE_1_DAILY_CHECKLIST.md
#   deleted:    docs/Plan
#   deleted:    docs/plan2
```

---

## Step 2.3: Delete Files - Option B (Manual + Git)

If preferred, delete manually first then ensure git tracks it:

```powershell
# Manual deletion (PowerShell)
Remove-Item "plan\ERROR_LOG.md" -Force
Remove-Item "plan\PHASE_1_DAILY_CHECKLIST.md" -Force
Remove-Item "docs\Plan" -Force
Remove-Item "docs\plan2" -Force

# Verify deletions
dir plan\ | Select-Object Name
# Should no longer show ERROR_LOG.md or PHASE_1_DAILY_CHECKLIST.md

# Let git track the deletions
cd path/to/haloguard
git add -A

git status
# EXPECTED: Shows deleted files
```

---

## Step 2.4: Commit Deletions

```bash
git commit -m "cleanup: remove completed phase tracking files

Deleted:
- plan/ERROR_LOG.md (Phase 0 errors, all resolved)
- plan/PHASE_1_DAILY_CHECKLIST.md (Phase 1 daily tracking complete)
- docs/Plan (malformed file, no content)
- docs/plan2 (malformed file, no content)

These files were completed/obsolete and can be recovered from:
- git history: git show HEAD~1:plan/ERROR_LOG.md
- backup: audit/backup/ERROR_LOG.md.bak

Impact: ~73KB freed, cleaner directory structure."
```

---

## Step 2.5: Verify Deletions

```powershell
# Confirm files are gone
dir plan\ | Select-Object Name
# Should NOT show ERROR_LOG.md or PHASE_1_DAILY_CHECKLIST.md

dir docs\ | Select-Object Name
# Should NOT show Plan or plan2

# Show commit just made
git log --oneline -1
# Shows: cleanup: remove completed phase tracking files
```

---

## Step 2.6: Rebuild to Verify No Breaks

```bash
# Rebuild all packages to ensure nothing broke
cd shared-core
npm run build
# EXPECTED: ✅ Build successful, no type errors

cd ../chrome-extension
npm run build
# EXPECTED: ✅ Build successful

npm run type-check
# EXPECTED: ✅ No type errors
```

**If Build Fails:**
```bash
# Revert the deletion
git revert HEAD

# Fix the issue
# Re-attempt cleanup

# Or restore from backup
cp audit/backup/ERROR_LOG.md.bak plan/ERROR_LOG.md
```

---

## Step 2.7: Run Tests (Optional but Recommended)

```bash
# Run test suite to ensure nothing broke
cd shared-core
npm run test
# EXPECTED: All tests pass (or same as before)

# Or for quick validation
npm run type-check
```

---

## Step 2.8: Verify Git History Preserved

```bash
# Show that deleted files are still in git history
git log -- plan/ERROR_LOG.md
# Shows commits that touched this file

# Recover deleted file if needed
git show HEAD~1:plan/ERROR_LOG.md > plan/ERROR_LOG.md
# Brings back the file from previous commit
```

---

## ✅ PHASE 2 VERIFICATION CHECKLIST

- [ ] Pre-deletion commit created
- [ ] Files marked for deletion confirmed deleted
- [ ] Git status shows deletions staged
- [ ] Deletion commit message clear and descriptive
- [ ] Backend rebuilds without errors
- [ ] Chrome extension rebuilds without errors
- [ ] Type checking passes
- [ ] Git history can be used to recover files
- [ ] Backups still exist in audit/backup/

**If all checks pass:** Phase 2 complete ✅

---

---

# PHASE 3: CONSOLIDATIONS (Optional)

**Time:** 2-3 hours  
**Risk:** 🟡 Medium (more complex)  
**Rollback:** Possible but requires more work

**Note:** This phase can be skipped if deletion is the priority. Consolidation improves organization but is not critical.

---

## Step 3.1: Plan Consolidation - Create INDEX.md

```bash
# Create new master planning file
touch plan/INDEX.md
```

**Content to add:**
```markdown
# 📋 HaloGuard Planning Hub

## How to Navigate

This folder contains all project planning documents organized by phase and concern.

### Quick Links

- **Roadmap** → [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) (6-phase timeline)
- **Status** → [STATUS](#status-overview) (current progress)
- **Current Phase** → [Phase 1 & 2](#phase-planning) (development plans)

## Status Overview

| Phase | Name | Status | Timeline |
|-------|------|--------|----------|
| **Phase 0** | Backend Foundation | ✅ Complete | Apr 1-12 |
| **Phase 1** | Chrome Extension | ✅ Complete | Apr 13 - May 1 |
| **Phase 2** | VS Code Extension | 🔨 Next | May 2-10 |
| **Phase 3** | React Dashboard | 📋 Planning | May 11 - Jun 5 |
| **Phase 4** | Production Launch | 📋 Planning | Jun 6 - Jun 20 |
| **Phase 5** | Growth & Validation | 📋 Planning | Jun 21+ |

## Quick Standup Reference

- What are we doing? See [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)
- What's blocking? Check GitHub issues
- What's next? See phase planning below

## Phase Planning

- [Phase 1 - Chrome Extension](PHASE_1_CHROME_EXTENSION.md) (reference)
- [Phase 2 - VS Code Extension](PHASE_2_VSCODE_EXTENSION.md) (next)
- [Phase 3 - React Dashboard](PHASE_3_REACT_DASHBOARD.md)
- [Phase 4 - Production Launch](PHASE_4_PRODUCTION_LAUNCH.md)
- [Phase 5 - Growth & Validation](PHASE_5_GROWTH_VALIDATION.md)

## Full Roadmap

Details: [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)

## Deprecated

These files are deprecated and kept for reference only:
- [_DEPRECATED_README.md](README.md) - See above instead
- [_DEPRECATED_QUICK_REFERENCE.md](QUICK_REFERENCE.md) - See Quick Standup Reference above
```

---

## Step 3.2: Rename Old Planning Files (Optional)

```bash
# Option A: Keep for reference with deprecation marker
mv plan/README.md plan/_DEPRECATED_README.md
mv plan/QUICK_REFERENCE.md plan/_DEPRECATED_QUICK_REFERENCE.md

# Option B: Delete after 2-week transition (safer)
# [Skip for now - can do later]
```

---

## Step 3.3: Licensing Documentation Consolidation

```bash
# Create licensing subdirectory
mkdir docs/licensing

# Move licensing files
mv docs/LICENSING_API_REFERENCE.md docs/licensing/API_REFERENCE.md
mv docs/LICENSING_SETUP_GUIDE.md docs/licensing/SETUP_GUIDE.md
```

**Create docs/licensing/EPIC_DETAILS.md:**
```markdown
# Licensing & Monetization Epic - Phase 3

## Overview

HaloGuard uses Stripe for subscription management and monetization.

**Epic Status:** Phase 3 (May 11 - Jun 5, 2026)

## Business Model

- **Free Tier:** Basic detection (Tiers 0-1)
- **Premium Tier:** Full detection (Tiers 0-5) + analytics
- **Enterprise Tier:** Custom integrations + SLA

## Technical Implementation

See [API_REFERENCE.md](API_REFERENCE.md) for API details.

## Architecture

- Backend: Node.js Express + Stripe SDK
- Database: PostgreSQL (subscriptions table)
- Payments: Stripe webhooks
- UI: React dashboard (Phase 3)

## Acceptance Criteria

- [ ] Stripe integration complete
- [ ] Subscription model tested
- [ ] React dashboard shows subscription status
- [ ] User can upgrade/downgrade
- [ ] Webhooks process payments correctly

## Implementation Files

- `shared-core/src/licensing/` - Core logic
- `shared-core/prisma/schema.prisma` - Database schema
- React dashboard (TBD in Phase 3)

Created: April 9, 2026
```

**Create docs/licensing/README.md:**
```markdown
# Licensing & Monetization Documentation

## For First-Time Setup
→ [SETUP_GUIDE.md](SETUP_GUIDE.md)

## API Integration
→ [API_REFERENCE.md](API_REFERENCE.md)

## Epic Details
→ [EPIC_DETAILS.md](EPIC_DETAILS.md)

## Stripe Webhook URLs

**Development (Local):**
```
http://localhost:3000/webhooks/stripe
```

**Production:**
```
https://api.haloguard.ai/webhooks/stripe
```

## Testing Stripe Locally

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Forward events to local server
stripe listen --forward-to localhost:3000/webhooks/stripe

# Trigger test event
stripe events resend evt_test_...
```

## Questions?

- Setup issues? → See SETUP_GUIDE.md
- API questions? → See API_REFERENCE.md
- Implementation details? → See ../shared-core/src/licensing/
```

---

## Step 3.4: Test All Consolidation Links

```bash
# After consolidation, verify all links work

# Test by looking for broken references
grep -r "plan/QUICK_REFERENCE\|plan/README" --include="*.md"
# Should get zero results

grep -r "docs/LICENSING" --include="*.md"
# Should only show in this checklist
```

---

## Step 3.5: Commit Consolidations

```bash
git add -A
git commit -m "docs: consolidate planning and licensing documentation

Planning Hub:
- Create plan/INDEX.md as single entry point
- Consolidate plan/README.md + QUICK_REFERENCE.md content
- Mark old files as deprecated (kept for reference)

Licensing:
- Create docs/licensing/ subdirectory
- Organize LICENSING_*.md files with clearer names
- Consolidate PHASE3_EPIC4_*.md into EPIC_DETAILS.md
- Add setup guide for licensing module

Benefits:
- Clearer structure for new contributors
- Easier to find documentation
- Reduced confusion from redundant docs
- Better organized for Phase 3 development"
```

---

## ✅ PHASE 3 VERIFICATION CHECKLIST

- [ ] plan/INDEX.md created and working
- [ ] docs/licensing/ directory created
- [ ] All licensing files moved and renamed
- [ ] docs/licensing/README.md created
- [ ] docs/licensing/EPIC_DETAILS.md created
- [ ] All cross-links verified
- [ ] No broken references
- [ ] Consolidation commit created
- [ ] Team notified of new documentation structure

**If all checks passing:** Consolidations complete ✅

---

---

# 🎉 POST-CLEANUP TASKS

## Final Verification

```bash
# Full build test
npm run build

# Type checking
npm run type-check

# Run tests (if configured)
npm run test

# Verify directory structure
tree -L 2 -I node_modules

# Show git log of cleanup commits
git log --oneline -10
```

## Notify Team

**Create Slack announcement:**

```
🧹 Cleanup Complete

We've streamlined the HaloGuard repository:

✅ Deleted:
- plan/ERROR_LOG.md (Phase 0 artifacts)
- plan/PHASE_1_DAILY_CHECKLIST.md (completed tracking)
- docs/Plan and docs/plan2 (malformed files)

✅ Consolidated (optional Phase 3):
- Created plan/INDEX.md as planning hub
- Organized docs/licensing/ for Phase 3 work

All changes tracked in git, recoverable if needed.

See audit/00_AUDIT_INDEX.md for full details.
```

## Update Main README.md

```markdown
# Getting Started

- **Setup:** See [STARTUP_GUIDE.md](STARTUP_GUIDE.md)
- **Development:** See [QUICK_START.md](QUICK_START.md)
- **Planning:** See [plan/INDEX.md](plan/INDEX.md)
- **Deployment:** See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
```

---

## Final Cleanup Checklist

- [ ] All phases completed (1-2 done, 3 optional)
- [ ] All builds passing
- [ ] All type checks passing
- [ ] No broken references
- [ ] Git commits created & pushed
- [ ] Backups stored in audit/backup (can be deleted later)
- [ ] Team notified
- [ ] Documentation updated
- [ ] Archive folder created (optional)

---

## If Anything Goes Wrong

### Quick Rollback (Last Commit)
```bash
git revert HEAD

# Or revert multiple commits
git revert HEAD~2..HEAD

# Or full reset (dangerous!)
git reset --hard HEAD~1
```

### Recover Deleted Files
```bash
# Find what commit deleted the file
git log --oneline -- plan/ERROR_LOG.md

# Recover from backup
cp audit/backup/ERROR_LOG.md.bak plan/ERROR_LOG.md

# Or from git history
git show <commit-hash>:plan/ERROR_LOG.md > plan/ERROR_LOG.md
```

---

## Timeline Summary

| Phase | Time | Risk | Must-Do |
|-------|------|------|---------|
| Phase 1: Safety Checks | 15 min | 🟢 None | ✅ Yes |
| Phase 2: Delete Files | 20 min | 🟢 Very Low | ✅ Yes |
| Phase 3: Consolidate | 2-3 hrs | 🟡 Medium | ❌ Optional |

**Total Time (1-2):** ~35 minutes  
**Total Time (1-3):** ~3 hours

---

## Sign-Off

**Cleanup Performed By:** [Name]  
**Date:** [YYYY-MM-DD]  
**Approval:** [Project Lead Sign-Off]  
**Status:** [✅ Complete / ❌ Issues Found]

**Issues Found (if any):**
```
[Document any issues encountered]
```

---

**Related Documents:**

- [00_AUDIT_INDEX.md](00_AUDIT_INDEX.md) - Audit overview
- [01_FILES_TO_DELETE.md](01_FILES_TO_DELETE.md) - What to delete
- [03_CONSOLIDATION_PLAN.md](03_CONSOLIDATION_PLAN.md) - Consolidation details
- [04_ARCHIVE_STRUCTURE.md](04_ARCHIVE_STRUCTURE.md) - Archive organization

---

**Status:** ✅ Ready for execution  
**Last Updated:** April 9, 2026  
**Requires Approval:** ⏸️ Yes - Ask project lead before executing Phase 2
