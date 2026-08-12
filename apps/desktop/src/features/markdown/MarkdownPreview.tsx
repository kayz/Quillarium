import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownPreview({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`markdown-preview ${className}`.trim()} data-testid="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => defaultUrlTransform(url)}
        components={{
          a: ({ children, ...props }) => (
            <a
              {...props}
              rel="noreferrer noopener"
              onClick={(event) => event.preventDefault()}
              title={props.href}
            >
              {children}
            </a>
          )
        }}
      >
        {content || '暂无内容'}
      </ReactMarkdown>
    </div>
  )
}
