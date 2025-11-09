from __future__ import annotations

import pathlib

_PACKAGE_DIR = pathlib.Path(__file__).resolve().parent
_SRC_PACKAGE = _PACKAGE_DIR.parent / "src" / "coder_brain"

if not _SRC_PACKAGE.is_dir():
    raise ModuleNotFoundError(
        "Unable to locate the 'coder_brain' package. Did you forget to install it?"
    )

__file__ = str(_SRC_PACKAGE / "__init__.py")
__path__ = [str(_SRC_PACKAGE)]

spec = globals().get("__spec__")
if spec is not None:
    spec.origin = __file__
    spec.submodule_search_locations = list(__path__)

exec(compile((_SRC_PACKAGE / "__init__.py").read_text(encoding="utf-8"), __file__, "exec"))
