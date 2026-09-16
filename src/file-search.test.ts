import { describe, it, expect } from 'vitest';
import { searchFiles, safeRelativePath, absoluteFilePath } from './file-search';

describe('file-search', () => {
  describe('searchFiles', () => {
    const mockFiles = [
      'src/api.ts',
      'src/api.test.ts',
      'src/model-display.ts',
      'src/components/Button.tsx',
      'docs/README.md',
    ];

    it('应该模糊匹配文件路径', () => {
      const results = searchFiles(mockFiles, 'api');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toContain('api');
    });

    it('应该返回空数组当没有匹配', () => {
      const results = searchFiles(mockFiles, 'nonexistent');
      expect(results).toEqual([]);
    });

    it('应该处理空输入', () => {
      const results = searchFiles(mockFiles, '');
      // 空查询返回所有文件
      expect(results.length).toBe(mockFiles.length);
    });

    it('应该处理空文件列表', () => {
      const results = searchFiles([], 'test');
      expect(results).toEqual([]);
    });
  });

  describe('safeRelativePath', () => {
    it('应该接受普通相对路径', () => {
      expect(safeRelativePath('src/test.ts')).toBe(true);
      expect(safeRelativePath('docs/README.md')).toBe(true);
    });

    it('应该拒绝包含 .. 的路径', () => {
      expect(safeRelativePath('../etc/passwd')).toBe(false);
      expect(safeRelativePath('src/../../../etc')).toBe(false);
    });
  });

  describe('absoluteFilePath', () => {
    it('应该拼接根路径和相对路径', () => {
      const result = absoluteFilePath('/workspace', 'src/test.ts');
      expect(result).toBe('/workspace/src/test.ts');
    });

    it('应该处理根路径带尾部斜杠', () => {
      const result = absoluteFilePath('/workspace/', 'src/test.ts');
      expect(result).toContain('/workspace');
      expect(result).toContain('src/test.ts');
    });
  });
});

