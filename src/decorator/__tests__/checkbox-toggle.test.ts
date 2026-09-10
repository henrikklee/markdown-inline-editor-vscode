import type { Mock } from 'vitest';
import { handleCheckboxClick } from '../checkbox-toggle';
import { workspace, WorkspaceEdit, Selection, Position, Uri, TextDocument } from '../../test/__mocks__/vscode';

/** Build a minimal TextEditor-shaped object for checkbox-toggle tests. */
function makeEditor(lineText: string, cursorChar: number) {
  const doc = new TextDocument(Uri.file('test.md'), 'markdown', 1, lineText);
  let currentSelection = new Selection(new Position(0, cursorChar), new Position(0, cursorChar));
  return {
    document: doc,
    get selection() { return currentSelection; },
    set selection(s: any) { currentSelection = s; },
  };
}

describe('handleCheckboxClick', () => {
  beforeEach(() => {
    (workspace.applyEdit as Mock).mockClear();
  });

  describe('returns false (no toggle)', () => {
    it('returns false when there is no checkbox on the line', () => {
      const editor = makeEditor('just some text', 5);
      expect(handleCheckboxClick(editor as any)).toBe(false);
      expect(workspace.applyEdit).not.toHaveBeenCalled();
    });

    it('returns false when cursor is outside the checkbox range', () => {
      // "- [ ] task" — checkbox at chars 2-4; cursor at char 8 (inside "task")
      const editor = makeEditor('- [ ] task', 8);
      expect(handleCheckboxClick(editor as any)).toBe(false);
    });

    it('returns false when selection is non-empty (text selected)', () => {
      const doc = new TextDocument(Uri.file('test.md'), 'markdown', 1, '- [ ] task');
      // Non-empty selection: anchor ≠ active
      const editor = {
        document: doc,
        selection: new Selection(new Position(0, 2), new Position(0, 5)),
      };
      expect(handleCheckboxClick(editor as any)).toBe(false);
      expect(workspace.applyEdit).not.toHaveBeenCalled();
    });

    it('toggles when the cursor lands just after the closing bracket (box edge)', () => {
      // "- [ ] task" — index 5 is the space right after "]". The rendered box
      // covers it, so a click there must toggle exactly like the box.
      const editor = makeEditor('- [ ] task', 5);
      expect(handleCheckboxClick(editor as any)).toBe(true);
      const edit = (workspace.applyEdit as Mock).mock.calls[0][0] as WorkspaceEdit;
      expect(edit.getEdits()[0].newText).toBe('x');
    });

    it('does not toggle a [ ] that is not a task-list checkbox', () => {
      const editor = makeEditor('text with [ ] brackets', 11);
      expect(handleCheckboxClick(editor as any)).toBe(false);
      expect(workspace.applyEdit).not.toHaveBeenCalled();
    });

    it('does not toggle a trailing [ ] later in a task-list line', () => {
      // "- [ ] some item [ ]" — the second [ ] is not a checkbox
      const editor = makeEditor('- [ ] some item [ ]', 17);
      expect(handleCheckboxClick(editor as any)).toBe(false);
      expect(workspace.applyEdit).not.toHaveBeenCalled();
    });
  });

  describe('toggles unchecked → checked', () => {
    it('toggles when the cursor is on the opening bracket', () => {
      // "- [ ] task" — checkbox starts at char 2
      const editor = makeEditor('- [ ] task', 2);
      const result = handleCheckboxClick(editor as any);
      expect(result).toBe(true);
      expect(workspace.applyEdit).toHaveBeenCalledTimes(1);
      const edit = (workspace.applyEdit as Mock).mock.calls[0][0] as WorkspaceEdit;
      const edits = edit.getEdits();
      expect(edits).toHaveLength(1);
      expect(edits[0].newText).toBe('x');
    });

    it('toggles when the cursor is inside the brackets', () => {
      const editor = makeEditor('- [ ] task', 3);
      expect(handleCheckboxClick(editor as any)).toBe(true);
    });

    it('toggles when the cursor is on the closing bracket', () => {
      const editor = makeEditor('- [ ] task', 4);
      expect(handleCheckboxClick(editor as any)).toBe(true);
    });

    it('toggles an indented task-list checkbox', () => {
      const editor = makeEditor('  - [ ] task', 4);
      expect(handleCheckboxClick(editor as any)).toBe(true);
    });

    it('toggles an ordered task-list checkbox', () => {
      const editor = makeEditor('1. [ ] task', 3);
      expect(handleCheckboxClick(editor as any)).toBe(true);
    });
  });

  describe('toggles checked → unchecked', () => {
    it('toggles [x] to [ ] (lowercase x)', () => {
      const editor = makeEditor('- [x] done', 3);
      expect(handleCheckboxClick(editor as any)).toBe(true);
      const edit = (workspace.applyEdit as Mock).mock.calls[0][0] as WorkspaceEdit;
      expect(edit.getEdits()[0].newText).toBe(' ');
    });

    it('toggles [X] to [ ] (uppercase X)', () => {
      const editor = makeEditor('- [X] done', 3);
      expect(handleCheckboxClick(editor as any)).toBe(true);
    });
  });

  describe('code protection', () => {
    it('does not toggle an empty [ ] inside a fenced code block', () => {
      const markdown = '```js\nconst arr = [ ];\n```';
      const doc = new TextDocument(Uri.file('test.md'), 'markdown', 1, markdown);
      const editor = {
        document: doc,
        selection: new Selection(new Position(1, 13), new Position(1, 13)),
      };
      expect(handleCheckboxClick(editor as any)).toBe(false);
      expect(workspace.applyEdit).not.toHaveBeenCalled();
    });

    it('does not toggle an empty [ ] inside an inline code span', () => {
      const editor = makeEditor('Here is code: `const a = [ ];` in text', 26);
      expect(handleCheckboxClick(editor as any)).toBe(false);
      expect(workspace.applyEdit).not.toHaveBeenCalled();
    });
  });

  describe('caret', () => {
    it('does not move the caret itself (the decorator restores it)', () => {
      const editor = makeEditor('- [ ] task', 3);
      handleCheckboxClick(editor as any);
      expect(editor.selection.active.character).toBe(3);
      expect(editor.selection.active.line).toBe(0);
    });
  });

  describe('multiple checkboxes on one line', () => {
    it('toggles only the checkbox the cursor is on', () => {
      // "- [ ] a [ ] b" — first checkbox at 2, trailing [ ] at 8 (not a checkbox)
      const editor = makeEditor('- [ ] a [ ] b', 3);
      expect(handleCheckboxClick(editor as any)).toBe(true);
      const edit = (workspace.applyEdit as Mock).mock.calls[0][0] as WorkspaceEdit;
      expect(edit.getEdits()[0].range.start.character).toBe(3); // bracketStart(2) + 1
    });
  });
});
