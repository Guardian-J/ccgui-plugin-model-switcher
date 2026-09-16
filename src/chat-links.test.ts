import { describe, it, expect } from 'vitest';
import { httpUrl } from './chat-links';

describe('chat-links', () => {
  describe('httpUrl', () => {
    it('应该接受有效的 HTTP URL', () => {
      expect(httpUrl('http://example.com')).toBe('http://example.com/');
      expect(httpUrl('https://example.com')).toBe('https://example.com/');
      expect(httpUrl('https://example.com/path')).toBe('https://example.com/path');
    });

    it('应该接受带查询参数的 URL', () => {
      expect(httpUrl('https://example.com?foo=bar')).toBe('https://example.com/?foo=bar');
      expect(httpUrl('https://example.com/path?a=1&b=2')).toBe('https://example.com/path?a=1&b=2');
    });

    it('应该接受带 hash 的 URL', () => {
      expect(httpUrl('https://example.com#section')).toBe('https://example.com/#section');
      expect(httpUrl('https://example.com/page#top')).toBe('https://example.com/page#top');
    });

    it('应该拒绝非 HTTP/HTTPS 协议', () => {
      expect(httpUrl('ftp://example.com')).toBe(null);
      expect(httpUrl('file:///etc/passwd')).toBe(null);
      expect(httpUrl('javascript:alert(1)')).toBe(null);
      expect(httpUrl('data:text/html,<script>alert(1)</script>')).toBe(null);
    });

    it('应该拒绝无协议的 URL', () => {
      expect(httpUrl('example.com')).toBe(null);
      expect(httpUrl('www.example.com')).toBe(null);
      expect(httpUrl('//example.com')).toBe(null);
    });

    it('应该拒绝包含用户名或密码的 URL', () => {
      expect(httpUrl('https://user@example.com')).toBe(null);
      expect(httpUrl('https://user:pass@example.com')).toBe(null);
    });

    it('应该拒绝无主机名的 URL', () => {
      expect(httpUrl('https://')).toBe(null);
      expect(httpUrl('http://')).toBe(null);
    });

    it('应该处理端口号', () => {
      expect(httpUrl('http://localhost:3000')).toBe('http://localhost:3000/');
      expect(httpUrl('https://example.com:8443/api')).toBe('https://example.com:8443/api');
    });

    it('应该拒绝无效格式', () => {
      expect(httpUrl('')).toBe(null);
      expect(httpUrl('not a url')).toBe(null);
      expect(httpUrl('https://[invalid')).toBe(null);
    });
  });
});
