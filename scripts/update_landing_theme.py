with open('src/landing/Landing.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    'return <section id="problem" className="section lp-section lp-light scroll-reveal" data-theme="cream">',
    'return <section id="problem" className="section lp-section lp-light surface-light scroll-reveal" data-theme="light">'
)
c = c.replace(
    'return <section id="how" className="section lp-section lp-light scroll-reveal" data-theme="cream">',
    'return <section id="how" className="section lp-section lp-light surface-light scroll-reveal" data-theme="light">'
)
c = c.replace(
    'return <section className="final-cta-wrap lp-light" data-theme="cream">',
    'return <section className="final-cta-wrap lp-light surface-light" data-theme="light">'
)
c = c.replace(
    '<div className="lp-calc stagger-reveal" ref={calcRef}>',
    '<div className="lp-calc stagger-reveal surface-dark" data-theme="dark" ref={calcRef}>'
)

with open('src/landing/Landing.jsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('Updated Landing.jsx successfully')
