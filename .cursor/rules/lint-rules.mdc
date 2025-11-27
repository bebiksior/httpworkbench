---
description:
globs:
alwaysApply: true
---

# Most common mistakes that lead to lint error

- Unexpected nullable string value in conditional. Please handle the nullish/empty cases explicitly
this one we prevent when comparing strings instead doing
```
if (!str) {}
```
we do
```
if (str !== undefined) {}
```


- Once you are done, ALWAYS run linter, typecheck and knip to ensure clean code
