import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

test('the dom project renders and loads the jest-dom matchers', () => {
  render(<p>ok</p>)
  // toBeInTheDocument only exists if test/setup.dom.ts registered the matchers.
  expect(screen.getByText('ok')).toBeInTheDocument()
})
