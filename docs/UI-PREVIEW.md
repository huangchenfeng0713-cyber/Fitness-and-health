# UI preview

This branch is a preview only. Do not merge to `main`.

`js/app.js` on this branch was accidentally overwritten during upload.
Apply the patch from `main` instead:

```bash
git fetch origin
git checkout main
git checkout -b ui-preview-local
git apply docs/ui-preview.patch
# or copy docs/ui-preview.patch from this branch first:
# git checkout origin/ui-preview -- docs/ui-preview.patch
```

Then open `index.html` locally (or your usual static server) to review.
