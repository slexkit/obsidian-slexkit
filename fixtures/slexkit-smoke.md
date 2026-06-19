# 跨文档状态实验室

这是 SlexKit 最独特的能力之一：**在同一个 Markdown 文档的不同位置放置多块 `slex` 代码，只要它们使用相同的 `namespace`，就会共享同一份 `g` 状态**。

下面是三个独立的 ` ```slex ` fence——一个控制面板和两个观察面板。试试修改控制面板的值，看下方两个面板实时响应。

## 主控面板

```slex
{
  slex: "0.1",
  namespace: "example_cross_doc_lab",
  g: {
    color: "blue", size: 16, theme: "light",
    style: function () {
      return 'color: ' + this.color + '; font-size: ' + this.size + 'px;';
    }
  },
  layout: {
    "section:control": {
      eyebrow: "平台能力",
      title: "跨文档状态实验室 · 主控面板",
      subtitle: "修改以下任何参数——下方两个独立 fence 块的卡片会同步更新。",
      "grid:controls": {
        columns: 1, mdColumns: 3,
        "select:color": {
          label: "文字颜色",
          "$value": "g.color",
          options: [
            { label: "蓝色", value: "blue" },
            { label: "绿色", value: "green" },
            { label: "橙色", value: "orange" },
            { label: "紫色", value: "purple" }
          ],
          onchange: "g.color = String($event)"
        },
        "slider:size": { label: "字体大小", "$value": "g.size", min: 8, max: 48, step: 2, unit: "px", onchange: "g.size = Number($event)" },
        "select:theme": {
          label: "卡片主题",
          "$value": "g.theme",
          options: [
            { label: "明亮", value: "light" },
            { label: "暗色", value: "dark" },
            { label: "信息", value: "info" }
          ],
          onchange: "g.theme = String($event)"
        }
      },
      "badge:note": { "$label": "'样式 ' + g.color + ' ' + g.size + 'px'", tone: "info" }
    }
  }
}
```

## 观察面板 A（同一 namespace，不同 fence 块）

```slex
{
  slex: "0.1",
  namespace: "example_cross_doc_lab",
  layout: {
    "card:a": {
      title: "观察面板 A — 纯文本样式",
      "stat:size": { "$label": "'字体大小：' + g.size + 'px'", "$value": "g.color" },
      "callout:preview": {
        "$tone": "g.theme === 'dark' ? 'danger' : g.theme === 'info' ? 'info' : 'success'",
        "$text": "g.theme === 'dark' ? '暗色模式：适合夜间阅读的配色方案。' : g.theme === 'info' ? '信息模式：用于强调技术细节。' : '明亮模式：默认的文档阅读配色。'"
      }
    }
  }
}
```

## 观察面板 B

```slex
{
  slex: "0.1",
  namespace: "example_cross_doc_lab",
  layout: {
    "card:b": {
      title: "观察面板 B — 参数详情",
      "grid:params": {
        columns: 1, mdColumns: 3,
        "stat:col": { label: "颜色", "$value": "g.color" },
        "stat:sz": { label: "字号", "$value": "g.size", unit: "px" },
        "stat:th": { label: "主题", "$value": "g.theme" }
      },
      "badge:sync": { "$label": "'已同步 ' + g.color", "$tone": "g.color === 'blue' ? 'info' : g.color === 'green' ? 'success' : g.color === 'orange' ? 'warning' : 'info'" }
    }
  }
}
```

**三个 fence 块**，同一个 `namespace: "example_cross_doc_lab"`，所有组件共享 `g` 对象。上面你在主控面板改颜色和大小，下面两个观察面板马上更新。

---

### 这意味着什么？

假设你在一篇长篇 Markdown 文档中：

```text
[控制面板 — 选择行业/指标/时间范围]
... 30 段 Markdown 叙事 ...
[图表 A — 自动反映控制面板的选项]
... 更多分析文字 ...
[图表 B — 同一份状态的不同可视化]
```

每个 ` ```slex ` 块可以独立渲染，但只要 namespace 相同，它们就共享状态。这对于：

- **技术白皮书**：顶部选参数，中间分析，底部结论，全程联动
- **项目协作文档**：状态跟踪表格在顶部，各团队任务卡片散布在正文中
- **AI 输出增强**：模型生成的多个可视化节点共享同一份推理结果

都是极其强大的模式。这不是一个 "组件库" 能做到的——这是 SlexKit 的核心设计。
