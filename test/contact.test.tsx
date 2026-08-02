import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Contact } from '@/app/regions/Contact'

test('renders the authoritative contact surface without private facts', () => {
  render(<Contact />)
  const region = screen.getByRole('region', { name: 'reach me' })
  const links = screen.getAllByRole('link')

  expect(links).toHaveLength(3)
  expect(links.map((link) => link.textContent)).toEqual([
    'github.com/its-everdred',
    'github.com/its-applekid',
    'linkedin.com/in/kevinweaver',
  ])
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    'https://github.com/its-everdred',
    'https://github.com/its-applekid',
    'https://linkedin.com/in/kevinweaver',
  ])
  for (const link of links) {
    expect(link).toHaveAttribute('rel', 'me noopener')
  }

  expect(region).toHaveTextContent('curl -sL kevinweaver.dev/resume.txt')
  expect(region).toHaveTextContent(
    'curl -sL kevinweaver.dev/kevinweaver.1 | man -l -'
  )
  expect(region.querySelectorAll('pre a')).toHaveLength(0)
  expect(region.querySelectorAll('a[href^="#"]')).toHaveLength(0)
  expect(region.querySelectorAll('[title]')).toHaveLength(0)
  expect(region.querySelector('button')).toBeNull()
  expect(region).not.toHaveTextContent(
    /@gmail\.com|mailto:|twitter|x\.com|status/i
  )
  expect(region).not.toHaveTextContent(/tel:|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/)
})
