import json
import math
import sys
from pathlib import Path


def simplify(points, tolerance):
    if len(points) <= 2:
        return points

    x, y = points[0]
    dx, dy = points[-1][0] - x, points[-1][1] - y
    length_squared = dx * dx + dy * dy
    distance, split = 0, 0
    for index, (px, py) in enumerate(points[1:-1], 1):
        projection = ((px - x) * dx + (py - y) * dy) / length_squared if length_squared else 0
        projection = max(0, min(1, projection))
        gap = math.hypot(px - x - projection * dx, py - y - projection * dy)
        if gap > distance:
            distance, split = gap, index

    if distance <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:split + 1], tolerance)[:-1] + simplify(points[split:], tolerance)


def project(longitude, latitude):
    return longitude + 180, 90 - latitude


def shape(feature):
    properties = feature['properties']
    code = next((value for value in (properties['ISO_A2'], properties['ISO_A2_EH']) if len(value) == 2), None)
    geometry = feature['geometry']
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    paths = []
    for polygon in polygons:
        for ring in polygon:
            points = simplify(ring, 0.055)
            if len(points) > 3:
                coordinates = 'L'.join(f'{x:.2f},{y:.2f}' for x, y in (project(*point) for point in points[:-1]))
                paths.append(f'M{coordinates}Z')

    result = {'id': properties['ADM0_A3'], 'code': code, 'path': ''.join(paths)}
    longitudes, latitudes = zip(*(point for polygon in polygons for point in polygon[0]))
    tiny = max(longitudes) - min(longitudes) < 1.25 and max(latitudes) - min(latitudes) < 1.25
    if code and (tiny or properties['LABELRANK'] >= 5 or not paths):
        result['marker'] = [round(value, 2) for value in project(properties['LABEL_X'], properties['LABEL_Y'])]
    return result


if __name__ == '__main__':
    source, output = map(Path, sys.argv[1:])
    features = json.loads(source.read_text(encoding='utf-8'))['features']
    shapes = [shape(feature) for feature in features if feature['properties']['ADM0_A3'] != 'ATA']
    output.write_text(json.dumps(shapes, separators=(',', ':')) + '\n', encoding='utf-8')
