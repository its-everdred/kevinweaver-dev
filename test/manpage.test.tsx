import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ManPage } from '@/app/regions/ManPage'
import { MAN_HEADER } from '@/content/manpage'

/**
 * The roff footer (`KEVINWEAVER(1)  <revision date>  KEVINWEAVER(1)`) rendered
 * run-together in the pager and was cut. The `.TH` line of the real roff and
 * text artifacts still needs `MAN_FOOTER`, so only the rendered row is gone.
 */
test('the pager renders the roff header and no roff footer', () => {
  const { container } = render(<ManPage />)
  const doc = container.querySelector('.kw-man-doc')
  expect(doc).not.toBeNull()
  const text = doc?.textContent ?? ''

  expect(container.querySelectorAll('.kw-man-chrome')).toHaveLength(1)
  expect(container.querySelector('.kw-man-chrome')).toHaveTextContent(
    MAN_HEADER.center
  )
  // The header contributes the only two title stamps; the footer added two more.
  expect(text.match(/KEVINWEAVER\(1\)/g)).toHaveLength(2)
  // The footer centre was the ISO revision date. Nothing in the pager carries one.
  expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
})
