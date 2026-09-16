# 架构说明

## CLI Logo 实现

### 当前实现

插件在 `src/icons.tsx` 中维护了 CLI engine 的 logo 实现，包括：

1. **静态 SVG 组件**：Claude、DeepSeek、Gemini 等品牌的 logo
2. **品牌推断逻辑**：`inferModelEngine()` 函数根据模型名称推断对应品牌
3. **显示名称映射**：`CLI_DISPLAY_NAMES` 定义各 CLI 的显示名称

### 与宿主的关系

这些实现**派生自宿主的标准实现**：

- **宿主标准实现位置**：
  - `merged/src/components/foundations/icons/engine-icon.tsx`
  - `merged/src/components/foundations/icons/engine-brands.ts`

- **为什么插件需要维护副本**：
  - 插件 SDK (`PluginContext`) 不提供访问宿主基础组件的 API
  - 插件无法直接 `import` 宿主的 `EngineIcon` 组件
  - 这是插件架构的技术限制，而非设计选择

### 同步策略

当宿主添加新 CLI 或更新现有 logo 时，需要手动同步到插件：

1. **检查宿主更新**：
   ```bash
   # 查看宿主的 engine-icon.tsx
   cat merged/src/components/foundations/icons/engine-icon.tsx
   
   # 查看宿主的 engine-brands.ts
   cat merged/src/components/foundations/icons/engine-brands.ts
   ```

2. **同步到插件**：
   - 更新 `src/icons.tsx` 中的 SVG path 定义
   - 更新 `inferModelEngine()` 中的品牌匹配逻辑
   - 更新 `src/system-bridge.ts` 中的 `CLI_DISPLAY_NAMES`

3. **验证**：
   ```bash
   pnpm build
   pnpm typecheck
   ```

### 未来改进方向

理想情况下，宿主应该扩展 `PluginContext` API，提供：

```typescript
interface PluginContext {
  // ... 现有字段
  ui: {
    // ... 现有方法
    
    // 提议：共享基础组件
    foundations?: {
      EngineIcon: ComponentLike<{ engine: string; size?: number }>;
      getCliDisplayName: (engine: string) => string;
      inferModelEngine: (modelName: string) => string | null;
    };
  };
}
```

这样插件就可以直接使用宿主的标准实现，无需维护副本。

## 其他架构要点

### 组件提取

为降低组件复杂度，以下组件已从主组件中提取：

- `ModelList.tsx` - 模型列表渲染
- `ChannelRow.tsx` - 渠道行显示
- `EffortSlider.tsx` - Effort 级别选择器

### 代码健康

项目使用 `react-doctor` 进行代码健康检查：

```bash
pnpm check-health
```

当前目标：保持健康分数在 85+ 分。
