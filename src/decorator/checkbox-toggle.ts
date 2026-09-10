import { Position, Range, WorkspaceEdit, type TextEditor, workspace } from 'vscode';

/**
 * Handles a checkbox toggle when the user clicks a rendered task-list checkbox.
 * Detects whether the click is on a real checkbox and toggles it.
 *
 * The caret is deliberately not moved here: VS Code has already moved it as
 * part of the click, and the decorator restores the previous selection after a
 * successful toggle so clicking a checkbox does not move the cursor.
 *
 * @returns true if a checkbox was toggled, false otherwise
 */
export function handleCheckboxClick(editor: TextEditor): boolean {
  const selection = editor.selection;

  // Only handle single cursor clicks (no selection range)
  if (!selection.isEmpty) return false;

  const document = editor.document;
  const line = document.lineAt(selection.active.line);
  const cursorChar = selection.active.character;

  // Find checkbox pattern on this line: [ ] or [x] or [X]
  const checkboxRegex = /\[([ xX])\]/g;
  let match: RegExpExecArray | null;

  while ((match = checkboxRegex.exec(line.text)) !== null) {
    const bracketStart = match.index;
    const bracketEnd = match.index + 3; // [ ] is 3 chars

    // Only real task-list checkboxes: the brackets must be preceded by a list
    // marker (optionally indented). This stops arbitrary `[ ]` in prose, e.g.
    // the trailing one in "- [ ] some item [ ]", from being toggled.
    const textBefore = line.text.substring(0, bracketStart);
    const listMarkerMatch = textBefore.match(/^(\s*([-*+]|\d+[.)])\s+)$/);
    if (!listMarkerMatch) {
      continue;
    }

    // The list marker is collapsed by the parser, so a click on the rendered
    // box can land anywhere from the indent to the closing bracket.
    const clickStart = textBefore.search(/\S/);
    if (cursorChar >= clickStart && cursorChar <= bracketEnd) {
      const newState = match[1] === ' ' ? 'x' : ' ';

      const edit = new WorkspaceEdit();
      const charPosition = new Position(selection.active.line, bracketStart + 1);
      edit.replace(
        document.uri,
        new Range(charPosition, charPosition.translate(0, 1)),
        newState
      );

      workspace.applyEdit(edit);
      return true;
    }
  }

  return false;
}
