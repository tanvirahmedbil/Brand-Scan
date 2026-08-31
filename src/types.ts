export interface BrandGuide {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    button: string;
  };
  uiStyling: {
    borderRadius: string;
    shadowStyle: string;
  };
  typography: {
    fonts: string[];
    headings: {
      h1: TypographyStyle;
      h2: TypographyStyle;
      h3: TypographyStyle;
    };
    bodyText: TypographyStyle;
  };
}

export interface TypographyStyle {
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
}
