import pptxgen from "pptxgenjs";
import { mkdir } from "node:fs/promises";
const pptx = new pptxgen();
pptx.author = "StudyFlow acceptance test";
pptx.subject = "C# OOP educational fixture";
pptx.title = "Object-oriented programming in C#";
const slides = [
  [
    "Classes and objects",
    'A class defines the structure and behaviour of objects. An object is an instance of a class.\nExample: class Student { public string Name { get; set; } }\nvar student = new Student(); student.Name = "Eva";',
  ],
  [
    "Fields and properties",
    "Fields hold data. Properties control how values are read and changed.\nUse a private field with a public property to enforce rules. Example: a non-negative age.",
  ],
  [
    "Constructors",
    'A constructor runs when an object is created. It initializes required state.\npublic Student(string name) { Name = name; }\nvar eva = new Student("Eva");',
  ],
  [
    "Inheritance",
    "A derived class inherits members of a base class.\nclass Person { public string Name { get; set; } }\nclass Student : Person { public string University { get; set; } }",
  ],
  [
    "Method overriding and polymorphism",
    "A base virtual method can be overridden in a derived class. The runtime object determines which override executes.\nPerson person = new Student(); person.Introduce();\nThis differs from overloading, which selects a signature.",
  ],
  [
    "Abstract classes and methods",
    "An abstract class cannot be instantiated. It can define abstract methods without bodies. Non-abstract subclasses must implement them.\nabstract class Shape { public abstract double Area(); }",
  ],
];
for (const [title, body] of slides) {
  const slide = pptx.addSlide();
  slide.addText(title, {
    x: 0.5,
    y: 0.4,
    w: 9,
    h: 0.6,
    fontSize: 28,
    bold: true,
  });
  slide.addText(body, {
    x: 0.5,
    y: 1.4,
    w: 9,
    h: 3.5,
    fontSize: 20,
    breakLine: false,
  });
}
await mkdir("fixtures", { recursive: true });
await pptx.writeFile({ fileName: "fixtures/oop-acceptance.pptx" });
console.log("Created fixtures/oop-acceptance.pptx");
