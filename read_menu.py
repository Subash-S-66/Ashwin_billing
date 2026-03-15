import pandas as pd
import json

try:
    df = pd.read_excel('Menu_Price_List.xlsx')
    records = df.to_dict(orient='records')
    with open('menu.json', 'w', encoding='utf-8') as f:
        json.dump(records, f, indent=4)
    print("Successfully read and saved to menu.json")
except Exception as e:
    print(f"Error: {e}")
