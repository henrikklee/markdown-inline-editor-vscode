import { Position, Range, WorkspaceEdit, type TextEditor, type TextDocument, workspace } from 'vscode';

/**
 * Checks if a line in a document is inside a fenced code block (``` or ~~~).
 *
 * Guard adapted from #152 by @martin-winkler.
 */
export function isInsideCodeBlock(document: TextDocument, lineNumber: number): boolean {
  let inside = false;
  let fenceChar = '';
  let fenceLen = 0;
  for (let i = 0; i <= lineNumber; i++) {
    const lineText = document.lineAt(i).text.trimStart();
    if (!inside) {
      const match = lineText.match(/^(`{3,}|~{3,})/);
      if (match) {
        inside = true;
        fenceChar = match[1][0];
        fenceLen = match[1].length;
      }
    } else {
      const match = lineText.match(/^(`{3,}|~{3,})/);
      if (match && match[1][0] === fenceChar && match[1].length >= fenceLen) {
        if (i === lineNumber) {
          return true;
        }
        inside = false;
      }
    }
  }
  return inside;
}

/**
 * Checks if an offset on a line is inside an inline code span (`...`).
 *
 * Guard adapted from #152 by @martin-winkler.
 */
export function isInsideInlineCode(lineText: string, charIndex: number): boolean {
  for (let i = 0; i < lineText.length; i++) {
    if (lineText[i] === '`') {
      let backtickLen = 1;
      while (i + backtickLen < lineText.length && lineText[i + backtickLen] === '`') {
        backtickLen++;
      }
      const closingRun = '`'.repeat(backtickLen);
      const closeIdx = lineText.indexOf(closingRun, i + backtickLen);
      if (closeIdx !== -1) {
        if (charIndex >= i && charIndex < closeIdx + backtickLen) {
          return true;
        }
        i = closeIdx + backtickLen - 1;
      } else {
        i += backtickLen - 1;
      }
    }
  }
  return false;
}

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

  // Never toggle inside fenced code blocks.
  if (isInsideCodeBlock(document, selection.active.line)) {
    return false;
  }

  // Find checkbox pattern on this line: [ ] or [x] or [X]
  const checkboxRegex = /\[([ xX])\]/g;
  let match: RegExpExecArray | null;

  while ((match = checkboxRegex.exec(line.text)) !== null) {
    const bracketStart = match.index;
    const bracketEnd = match.index + 3; // [ ] is 3 chars

    // Never toggle inside inline code spans.
    if (isInsideInlineCode(line.text, bracketStart)) {
      continue;
    }

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
